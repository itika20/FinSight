import os

from click import prompt
import openai
import pdfplumber
import io
import uuid
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, status
from openai import OpenAI, api_key, api_key
from app.core.config import settings
import json
from dotenv import load_dotenv
import re

client = OpenAI(api_key=settings.OPENAI_API_KEY)

# MIME types we accept
VALID_PDF_MIMES = {'application/pdf'}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

# ─────────────────────────────────────────────
# FILE VALIDATION
# ─────────────────────────────────────────────

def validate_file(filename: str, content_type: str, file_size: int) -> str:
    """
    Validates PDF file type and size.
    Returns 'pdf' if valid.
    Raises HTTPException if invalid.
    """
    # Check size first — cheap operation
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "file_too_large",
                "message": f"File too large. Maximum size is 10MB."
            }
        )

    # Check if file is PDF
    is_pdf = (
        content_type in VALID_PDF_MIMES or
        filename.lower().endswith('.pdf')
    )

    if is_pdf:
        return 'pdf'
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": "Only PDF files are supported."
            }
        )

# ─────────────────────────────────────────────
# DATE PARSING HELPER
# ─────────────────────────────────────────────

def parse_date(value: str) -> Optional[str]:
    """
    Tries multiple date formats — banks use different formats.
    Returns YYYY-MM-DD string or None if unparseable.
    """
    formats = [
        '%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d',
        '%d-%m-%Y', '%d %b %Y', '%d-%b-%Y',
        '%d/%m/%y', '%m/%d/%y'
    ]
    for fmt in formats:
        try:
            return datetime.strptime(str(value).strip(), fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None

# ─────────────────────────────────────────────
# PDF PARSING
# ─────────────────────────────────────────────

def parse_pdf(file_bytes: bytes) -> tuple[list[dict], int]:
    """
    Two-strategy PDF parser:
    Strategy 1 — Tabula table extraction (fast, free, works for most PDFs)
    Strategy 2 — LLM extraction (universal fallback for complex/bilingual PDFs)
    """
    try:
        return _parse_pdf_llm(file_bytes)

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"parse_pdf failed: {type(e).__name__}: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": "Failed to parse PDF. Please ensure it is a valid bank statement."
            }
        )

def _parse_pdf_llm(file_bytes: bytes) -> tuple[list[dict], int]:
    
    # Step 1 — Extract text page by page
    pages_text = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text and text.strip():
                pages_text.append(text)

    if not pages_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "parse_failed", "message": "Could not extract text from PDF."}
        )

    # Step 2 — Group pages into chunks of ~3 pages each
    # Each chunk fits comfortably within token limits
    PAGES_PER_CHUNK = 3
    chunks = []
    for i in range(0, len(pages_text), PAGES_PER_CHUNK):
        chunk = '\n'.join(pages_text[i:i + PAGES_PER_CHUNK])
        chunks.append(chunk)

    print(f"Total pages: {len(pages_text)}, chunks: {len(chunks)}")

    prompt_template = """You are a bank statement parser. Extract ALL transactions from the text below.

Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
Each object must have exactly these fields:
- "date": string in YYYY-MM-DD format
- "description": string (the narration/description of the transaction)
- "amount": number (POSITIVE for credit/deposit, NEGATIVE for debit/withdrawal)
- "type": string, either "credit" or "debit"
- "balance": number or null (running balance after transaction)

Rules:
- Skip opening balance and closing balance rows
- Skip rows with no amount
- For Indian number format like "1,45,004.64" convert to 145004.64
- Debit/withdrawal = negative amount, Credit/deposit = positive amount
- "-" in debit or credit column means zero/empty for that column

Bank statement text:
{text}"""

    all_transactions = []
    skipped = 0

    # Step 3 — Call LLM once per chunk
    for chunk_num, chunk_text in enumerate(chunks):
        print(f"Processing chunk {chunk_num + 1}/{len(chunks)} ({len(chunk_text)} chars)")
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt_template.format(text=chunk_text)}],
                temperature=0,
                max_tokens=4000
            )

            raw_response = response.choices[0].message.content.strip()
            raw_response = re.sub(r'^```(?:json)?\s*', '', raw_response)
            raw_response = re.sub(r'\s*```$', '', raw_response)

            try:
                parsed = json.loads(raw_response)
            except json.JSONDecodeError:
                # Salvage completed transactions from truncated response
                last_complete = raw_response.rfind('},')
                if last_complete == -1:
                    last_complete = raw_response.rfind('}')
                if last_complete > 0:
                    salvaged = raw_response[:last_complete + 1] + ']'
                    salvaged = re.sub(r',\s*\]', ']', salvaged)
                    if not salvaged.strip().startswith('['):
                        salvaged = '[' + salvaged
                    parsed = json.loads(salvaged)
                    print(f"Chunk {chunk_num + 1}: salvaged {len(parsed)} transactions")
                else:
                    print(f"Chunk {chunk_num + 1}: could not parse, skipping")
                    continue

            if not isinstance(parsed, list):
                print(f"Chunk {chunk_num + 1}: response is not a list, skipping")
                continue

            print(f"Chunk {chunk_num + 1}: got {len(parsed)} transactions")

            # Step 4 — Normalise each transaction
            for item in parsed:
                try:
                    date_str = str(item.get('date', '')).strip()
                    parsed_date = parse_date(date_str)
                    if not parsed_date:
                        skipped += 1
                        continue

                    description = str(item.get('description', 'Unknown')).strip()
                    if not description or description.lower() == 'nan':
                        description = 'Unknown'

                    raw_amount = item.get('amount')
                    if raw_amount is None:
                        skipped += 1
                        continue

                    amount = float(str(raw_amount).replace(',', ''))
                    if amount == 0:
                        skipped += 1
                        continue

                    txn_type = item.get('type', '')
                    if txn_type not in ('credit', 'debit'):
                        txn_type = 'credit' if amount > 0 else 'debit'

                    raw_balance = item.get('balance')
                    balance = None
                    if raw_balance is not None:
                        try:
                            balance = float(str(raw_balance).replace(',', ''))
                        except (ValueError, TypeError):
                            pass

                    all_transactions.append({
                        "transaction_id": str(uuid.uuid4()),
                        "date": parsed_date,
                        "description": description,
                        "amount": round(amount, 2),
                        "type": txn_type,
                        "balance": balance
                    })

                except Exception as e:
                    print(f"Skipping row: {e} — {item}")
                    skipped += 1
                    continue

        except Exception as e:
            print(f"Chunk {chunk_num + 1} LLM call failed: {type(e).__name__}: {e}")
            continue

    print(f"LLM extraction complete: {len(all_transactions)} transactions, {skipped} skipped")

    if len(all_transactions) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": f"Only {len(all_transactions)} valid transactions found."
            }
        )

    return all_transactions, skipped

# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def parse_statement(file_bytes: bytes, file_type: str) -> tuple[list[dict], int]:
    """
    Parses PDF statement into list of transactions.
    Returns tuple of (transactions, skipped_count).
    """
    if file_type != 'pdf':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": "Only PDF files are supported."
            }
        )
    
    return parse_pdf(file_bytes)