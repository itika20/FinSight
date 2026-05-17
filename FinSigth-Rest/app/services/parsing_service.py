"""
PDF Parsing Service - Handles extraction of transactions from bank statement PDFs.
Supports multiple date formats and uses GPT-4o for intelligent transaction extraction.
"""

import io
import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional

import pdfplumber
from fastapi import HTTPException, status
from openai import OpenAI

from app.core.config import settings
from app.core.constants import (
    ERROR_FILE_TOO_LARGE,
    ERROR_INVALID_FILE_FORMAT,
    ERROR_PARSE_FAILED,
    DATE_FORMATS,
    PAGES_PER_CHUNK,
    SUPPORTED_FILE_TYPE,
    VALID_PDF_MIMES,
    MAX_FILE_SIZE_BYTES,
    LOGGER_PARSING
)

# Initialize logger for this module
logger = logging.getLogger(LOGGER_PARSING)

# Initialize OpenAI client
client = OpenAI(api_key=settings.OPENAI_API_KEY)

# ─────────────────────────────────────────────
# FILE VALIDATION
# ─────────────────────────────────────────────

def validate_file(filename: str, content_type: str, file_size: int) -> str:
    """
    Validates PDF file type and size before processing.
    
    Args:
        filename: Original filename from upload
        content_type: MIME type from request header
        file_size: File size in bytes
        
    Returns:
        str: 'pdf' if validation passes
        
    Raises:
        HTTPException: 400 if invalid format, 413 if file too large
        
    Examples:
        >>> validate_file('statement.pdf', 'application/pdf', 5000000)
        'pdf'
        >>> validate_file('statement.xlsx', 'application/vnd.ms-excel', 5000000)
        # Raises HTTPException with 400 status
    """
    logger.debug(f"Validating file: {filename} ({content_type}, {file_size} bytes)")
    
    # Check file size first — cheap validation
    if file_size > MAX_FILE_SIZE_BYTES:
        logger.warning(f"File size exceeded: {file_size} bytes > {MAX_FILE_SIZE_BYTES}")
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "error": "file_too_large",
                "message": ERROR_FILE_TOO_LARGE
            }
        )

    # Check if file is PDF based on MIME type or extension
    is_pdf = (
        content_type in VALID_PDF_MIMES or
        filename.lower().endswith('.pdf')
    )

    if is_pdf:
        logger.debug(f"File validation passed: {filename}")
        return SUPPORTED_FILE_TYPE
    else:
        logger.warning(f"Invalid file format: {filename} ({content_type})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": ERROR_INVALID_FILE_FORMAT
            }
        )

# ─────────────────────────────────────────────
# DATE PARSING HELPER
# ─────────────────────────────────────────────

def parse_date(value: str) -> Optional[str]:
    """
    Attempts to parse date from multiple formats commonly used by banks.
    Banks worldwide use different date formats, so we try each one in sequence.
    
    Args:
        value: Date string to parse
        
    Returns:
        str: Normalized date in YYYY-MM-DD format, or None if unparseable
        
    Examples:
        >>> parse_date('15/03/2026')
        '2026-03-15'
        >>> parse_date('03/15/2026')
        '2026-03-15'
        >>> parse_date('2026-03-15')
        '2026-03-15'
        >>> parse_date('invalid date')
        None
        
    Note:
        Returns None silently for unparseable dates. Callers should skip such rows.
    """
    if not value:
        return None
        
    # Try each format in order
    for date_format in DATE_FORMATS:
        try:
            parsed = datetime.strptime(str(value).strip(), date_format)
            result = parsed.strftime('%Y-%m-%d')
            logger.debug(f"Date parsed: {value} → {result}")
            return result
        except ValueError:
            continue
    
    logger.debug(f"Could not parse date: {value}")
    return None

# ─────────────────────────────────────────────
# PDF PARSING
# ─────────────────────────────────────────────

def parse_pdf(file_bytes: bytes) -> tuple[list[dict], int]:
    """
    Parses a PDF bank statement into structured transaction data.
    Uses GPT-4o for intelligent extraction, handles multiple date formats,
    and gracefully skips invalid rows.
    
    Args:
        file_bytes: Raw PDF file bytes
        
    Returns:
        tuple: (transactions_list, skipped_count)
          - transactions_list: List of normalized transaction dicts
          - skipped_count: Number of rows that could not be parsed
          
    Raises:
        HTTPException: 422 if PDF cannot be parsed or is empty
        
    Note:
        - Requires minimum 5 valid transactions to consider parse successful
        - Each transaction is given a unique UUID
        - Dates are normalized to YYYY-MM-DD format
    """
    logger.info("Starting PDF parsing")
    
    try:
        transactions, skipped = _parse_pdf_llm(file_bytes)
        logger.info(f"PDF parsing successful: {len(transactions)} transactions, {skipped} skipped")
        return transactions, skipped

    except HTTPException:
        # Re-raise HTTP exceptions from sub-functions
        raise
    except Exception as e:
        logger.exception(f"PDF parsing failed: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": ERROR_PARSE_FAILED
            }
        )


def _parse_pdf_llm(file_bytes: bytes) -> tuple[list[dict], int]:
    """
    Internal: Extracts transactions from PDF using GPT-4o LLM.

    Algorithm:
    1. Extract text from each PDF page
    2. Group pages into chunks (avoids hitting LLM token limits)
    3. Send each chunk to GPT-4o with a structured prompt
    4. Parse JSON response and normalize transactions
    5. Handle partial/truncated responses gracefully

    Args:
        file_bytes: Raw PDF bytes

    Returns:
        tuple: (transactions_list, skipped_count)

    Raises:
        HTTPException: 422 if extraction fails or too few transactions found
    """
    # ── MOCK MODE ─────────────────────────────────────────────────────────────
    # OpenAI API call is disabled to avoid token costs during development/testing.
    # Returns a fixed set of realistic mock transactions for any uploaded PDF.
    # TO RESTORE: delete this block (everything up to END MOCK MODE) and
    #             uncomment the real implementation below it.
    logger.warning("[MOCK MODE] Skipping GPT-4o API call — returning mock transactions")
    # Transactions spread across 3 months so the goals feature has sufficient history.
    # Each month has a salary credit >= Rs5,000 (required for income estimation).
    mock_transactions = [
        # ── March 2026 ──
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-01", "description": "ZOMATO ORDER#98234",             "amount": -450.00,   "type": "debit",  "balance": 52340.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-03", "description": "AMAZON.IN ORDER#405-1234567",    "amount": -1299.00,  "type": "debit",  "balance": 46041.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-04", "description": "SALARY CREDIT ACME CORP",        "amount": 85000.00,  "type": "credit", "balance": 131041.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-05", "description": "SWIGGY ORDER#SW998123",          "amount": -320.00,   "type": "debit",  "balance": 130721.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-08", "description": "BIGBASKET ORDER#BB44512",        "amount": -2340.00,  "type": "debit",  "balance": 126751.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-10", "description": "AIRTEL POSTPAID BILL",           "amount": -999.00,   "type": "debit",  "balance": 125752.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-12", "description": "ZERODHA MUTUAL FUND SIP",        "amount": -10000.00, "type": "debit",  "balance": 90752.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-15", "description": "FREELANCE PAYMENT RECEIVED",     "amount": 15000.00,  "type": "credit", "balance": 104976.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-18", "description": "FLIPKART ORDER#FK-9912345",      "amount": -3499.00,  "type": "debit",  "balance": 100587.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-03-19", "description": "HPCL FUEL STATION WHITEFIELD",   "amount": -3200.00,  "type": "debit",  "balance": 97387.50},

        # ── April 2026 ──
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-01", "description": "ZOMATO ORDER#99101",             "amount": -620.00,   "type": "debit",  "balance": 96767.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-03", "description": "BOOKMYSHOW MOVIE TICKETS",       "amount": -780.00,   "type": "debit",  "balance": 95987.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-04", "description": "SALARY CREDIT ACME CORP",        "amount": 85000.00,  "type": "credit", "balance": 180987.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-06", "description": "IRCTC TRAIN BOOKING PNR#654321", "amount": -1850.00,  "type": "debit",  "balance": 179137.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-09", "description": "BIGBASKET ORDER#BB55621",        "amount": -2890.00,  "type": "debit",  "balance": 176247.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-11", "description": "NETFLIX SUBSCRIPTION",           "amount": -649.00,   "type": "debit",  "balance": 175598.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-14", "description": "UBER TRIP BANGALORE",            "amount": -310.00,   "type": "debit",  "balance": 175288.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-17", "description": "APOLLO PHARMACY",                "amount": -1200.00,  "type": "debit",  "balance": 174088.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-20", "description": "AMAZON.IN ORDER#406-7654321",    "amount": -4299.00,  "type": "debit",  "balance": 169789.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-04-25", "description": "ZERODHA MUTUAL FUND SIP",        "amount": -10000.00, "type": "debit",  "balance": 159789.50},

        # ── May 2026 ──
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-02", "description": "SWIGGY ORDER#SW112233",          "amount": -510.00,   "type": "debit",  "balance": 159279.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-04", "description": "SALARY CREDIT ACME CORP",        "amount": 85000.00,  "type": "credit", "balance": 244279.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-06", "description": "HPCL FUEL STATION WHITEFIELD",   "amount": -3500.00,  "type": "debit",  "balance": 240779.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-08", "description": "NEFT/HDFC0001234/RENT PAYMENT",  "amount": -25000.00, "type": "debit",  "balance": 215779.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-10", "description": "AIRTEL POSTPAID BILL",           "amount": -999.00,   "type": "debit",  "balance": 214780.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-12", "description": "STARBUCKS KORAMANGALA",          "amount": -640.00,   "type": "debit",  "balance": 214140.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-14", "description": "BIGBASKET ORDER#BB66789",        "amount": -2100.00,  "type": "debit",  "balance": 212040.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-16", "description": "BOOKMYSHOW COMEDY SHOW",         "amount": -1200.00,  "type": "debit",  "balance": 210840.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-18", "description": "FLIPKART ORDER#FK-1123456",      "amount": -2799.00,  "type": "debit",  "balance": 208041.50},
        {"transaction_id": str(uuid.uuid4()), "date": "2026-05-20", "description": "LIC PREMIUM AUTO DEBIT",         "amount": -4500.00,  "type": "debit",  "balance": 203541.50},
    ]
    logger.info(f"[MOCK MODE] Returning {len(mock_transactions)} mock transactions across 3 months")
    return mock_transactions, 0
    # ── END MOCK MODE ──────────────────────────────────────────────────────────

    # ── REAL IMPLEMENTATION (disabled during testing) ──────────────────────────
    # logger.info("Initializing PDF text extraction")
    #
    # # ── Step 1: Extract text from each page ──
    # pages_text = []
    # try:
    #     with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
    #         logger.debug(f"PDF opened: {len(pdf.pages)} pages")
    #         for page_num, page in enumerate(pdf.pages, 1):
    #             text = page.extract_text()
    #             if text and text.strip():
    #                 pages_text.append(text)
    #                 logger.debug(f"Extracted page {page_num}: {len(text)} chars")
    # except Exception as e:
    #     logger.error(f"Failed to extract PDF text: {e}")
    #     raise HTTPException(
    #         status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    #         detail={"error": "parse_failed", "message": ERROR_PARSE_FAILED}
    #     )
    #
    # if not pages_text:
    #     logger.warning("No extractable text found in PDF")
    #     raise HTTPException(
    #         status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    #         detail={"error": "parse_failed", "message": "Could not extract text from PDF."}
    #     )
    #
    # # ── Step 2: Group pages into chunks for processing ──
    # chunks = []
    # for i in range(0, len(pages_text), PAGES_PER_CHUNK):
    #     chunk = '\n'.join(pages_text[i:i + PAGES_PER_CHUNK])
    #     chunks.append(chunk)
    #
    # logger.info(f"Created {len(chunks)} chunks from {len(pages_text)} pages")
    #
    # # ── Step 3: LLM extraction prompt ──
    # prompt_template = """You are a bank statement parser. Extract ALL transactions from the text below.
    #
    # Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
    # Each object must have exactly these fields:
    # - "date": string in YYYY-MM-DD format
    # - "description": string (the narration/description of the transaction)
    # - "amount": number (POSITIVE for credit/deposit, NEGATIVE for debit/withdrawal)
    # - "type": string, either "credit" or "debit"
    # - "balance": number or null (running balance after transaction)
    #
    # Rules:
    # - Skip opening balance and closing balance rows
    # - Skip rows with no amount
    # - For Indian number format like "1,45,004.64" convert to 145004.64
    # - Debit/withdrawal = negative amount, Credit/deposit = positive amount
    # - "-" in debit or credit column means zero/empty for that column
    #
    # Bank statement text:
    # {text}"""
    #
    # all_transactions = []
    # skipped = 0
    #
    # # ── Step 4: Process each chunk with LLM ──
    # for chunk_num, chunk_text in enumerate(chunks, 1):
    #     logger.info(f"Processing chunk {chunk_num}/{len(chunks)} ({len(chunk_text)} chars)")
    #
    #     try:
    #         # Call GPT-4o API
    #         response = client.chat.completions.create(
    #             model="gpt-4o",
    #             messages=[{"role": "user", "content": prompt_template.format(text=chunk_text)}],
    #             temperature=0,
    #             max_tokens=4000
    #         )
    #
    #         raw_response = response.choices[0].message.content.strip()
    #
    #         # Clean markdown code blocks if present
    #         raw_response = re.sub(r'^```(?:json)?\s*', '', raw_response)
    #         raw_response = re.sub(r'\s*```$', '', raw_response)
    #
    #         # ── Parse JSON response ──
    #         try:
    #             parsed = json.loads(raw_response)
    #         except json.JSONDecodeError as e:
    #             logger.warning(f"Chunk {chunk_num}: JSON decode error, attempting salvage")
    #             last_complete = raw_response.rfind('},')
    #             if last_complete == -1:
    #                 last_complete = raw_response.rfind('}')
    #             if last_complete > 0:
    #                 salvaged = raw_response[:last_complete + 1] + ']'
    #                 salvaged = re.sub(r',\s*\]', ']', salvaged)
    #                 if not salvaged.strip().startswith('['):
    #                     salvaged = '[' + salvaged
    #                 parsed = json.loads(salvaged)
    #                 logger.info(f"Chunk {chunk_num}: salvaged {len(parsed)} transactions from truncated response")
    #             else:
    #                 logger.warning(f"Chunk {chunk_num}: could not salvage, skipping")
    #                 continue
    #
    #         if not isinstance(parsed, list):
    #             logger.warning(f"Chunk {chunk_num}: response is not a list, skipping")
    #             continue
    #
    #         logger.debug(f"Chunk {chunk_num}: LLM returned {len(parsed)} transactions")
    #
    #         # ── Step 5: Normalize each transaction ──
    #         for item in parsed:
    #             try:
    #                 date_str = str(item.get('date', '')).strip()
    #                 parsed_date = parse_date(date_str)
    #                 if not parsed_date:
    #                     logger.debug(f"Row skipped: unparseable date '{date_str}'")
    #                     skipped += 1
    #                     continue
    #
    #                 description = str(item.get('description', 'Unknown')).strip()
    #                 if not description or description.lower() == 'nan':
    #                     description = 'Unknown'
    #
    #                 raw_amount = item.get('amount')
    #                 if raw_amount is None:
    #                     logger.debug(f"Row skipped: missing amount")
    #                     skipped += 1
    #                     continue
    #
    #                 amount = float(str(raw_amount).replace(',', ''))
    #                 if amount == 0:
    #                     logger.debug(f"Row skipped: zero amount")
    #                     skipped += 1
    #                     continue
    #
    #                 txn_type = item.get('type', '')
    #                 if txn_type not in ('credit', 'debit'):
    #                     txn_type = 'credit' if amount > 0 else 'debit'
    #                     logger.debug(f"Transaction type inferred from amount sign: {txn_type}")
    #
    #                 raw_balance = item.get('balance')
    #                 balance = None
    #                 if raw_balance is not None:
    #                     try:
    #                         balance = float(str(raw_balance).replace(',', ''))
    #                     except (ValueError, TypeError):
    #                         pass
    #
    #                 transaction = {
    #                     "transaction_id": str(uuid.uuid4()),
    #                     "date": parsed_date,
    #                     "description": description,
    #                     "amount": round(amount, 2),
    #                     "type": txn_type,
    #                     "balance": balance
    #                 }
    #                 all_transactions.append(transaction)
    #                 logger.debug(f"Transaction added: {parsed_date} {description} {amount}")
    #
    #             except Exception as e:
    #                 logger.debug(f"Row skipped due to error: {type(e).__name__}: {e}")
    #                 skipped += 1
    #                 continue
    #
    #     except HTTPException:
    #         raise
    #     except Exception as e:
    #         logger.error(f"Chunk {chunk_num} LLM call failed: {type(e).__name__}: {e}")
    #         continue
    #
    # logger.info(f"LLM extraction complete: {len(all_transactions)} transactions, {skipped} skipped")
    #
    # if len(all_transactions) < 5:
    #     logger.warning(f"Too few transactions extracted ({len(all_transactions)} < 5)")
    #     raise HTTPException(
    #         status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    #         detail={
    #             "error": "parse_failed",
    #             "message": f"Only {len(all_transactions)} valid transactions found. Ensure this is a valid bank statement."
    #         }
    #     )
    #
    # return all_transactions, skipped

# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def parse_statement(file_bytes: bytes, file_type: str) -> tuple[list[dict], int]:
    """
    Entry point for parsing a bank statement file.
    Routes to appropriate parser based on file type.
    
    Args:
        file_bytes: Raw file bytes
        file_type: File type identifier (e.g., 'pdf')
        
    Returns:
        tuple: (transactions_list, skipped_count)
        
    Raises:
        HTTPException: 400 if unsupported file type, 422 if parsing fails
    """
    logger.info(f"parse_statement called with file_type: {file_type}")
    
    if file_type != SUPPORTED_FILE_TYPE:
        logger.error(f"Unsupported file type: {file_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": ERROR_INVALID_FILE_FORMAT
            }
        )
    
    return parse_pdf(file_bytes)