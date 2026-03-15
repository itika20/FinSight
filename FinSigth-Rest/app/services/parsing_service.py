import pandas as pd
import pdfplumber
import io
import uuid
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, status
from openai import OpenAI
from app.core.config import settings
import json

client = OpenAI(api_key=settings.OPENAI_API_KEY)

# MIME types we accept for each format
# CSV has multiple valid MIME types depending on OS and browser
VALID_CSV_MIMES = {
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/octet-stream',  # some systems send CSV as this
    'text/plain'                 # some systems send CSV as plain text
}
VALID_PDF_MIMES = {'application/pdf'}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

# ─────────────────────────────────────────────
# FILE VALIDATION
# ─────────────────────────────────────────────

def validate_file(filename: str, content_type: str, file_size: int) -> str:
    """
    Validates file type and size.
    Returns 'csv' or 'pdf' if valid.
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

    # Determine file type from MIME and extension together
    # We check both because MIME alone can be unreliable for CSV
    is_csv = (
        content_type in VALID_CSV_MIMES or
        filename.lower().endswith('.csv')
    )
    is_pdf = (
        content_type in VALID_PDF_MIMES or
        filename.lower().endswith('.pdf')
    )

    if is_pdf:
        return 'pdf'
    elif is_csv:
        return 'csv'
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": "Only CSV and PDF files are supported."
            }
        )

# ─────────────────────────────────────────────
# COLUMN DETECTION VIA OPENAI
# ─────────────────────────────────────────────

def detect_columns_with_openai(df: pd.DataFrame) -> dict:
    """
    Sends column names and sample rows to GPT.
    GPT identifies which column maps to date, description, debit, credit, balance.
    Returns a mapping dict like:
    { "date": "Value Date", "description": "Narration", "debit": "Withdrawal Amt.", ... }
    """
    # Prepare sample data to send to GPT
    # Only send first 5 rows — enough for pattern recognition
    sample = df.head(5).to_string()
    columns = list(df.columns)

 # ADD THIS — see exactly what we're sending to OpenAI
    print("=== COLUMN DETECTION DEBUG ===")
    print(f"Columns found: {columns}")
    print(f"DataFrame shape: {df.shape}")
    print(f"Sample data:\n{sample}")
    print("==============================")

    prompt = f"""
You are a bank statement parser. Here are the column headers and first 5 rows from a bank statement file:

Columns: {columns}

Sample data:
{sample}

Identify which column corresponds to each of these fields:
- date: the transaction date
- description: the transaction narration or description
- debit: the amount debited (money going out) — may not exist if single amount column
- credit: the amount credited (money coming in) — may not exist if single amount column
- amount: single column with both debits and credits (use this if no separate debit/credit)
- balance: the running account balance (optional)

Return ONLY a valid JSON object with these exact keys. Use null if a field cannot be identified.
Example: {{"date": "Value Date", "description": "Narration", "debit": "Withdrawal Amt.", "credit": "Deposit Amt.", "amount": null, "balance": "Closing Balance"}}

Rules:
- Use exact column names from the provided columns list
- Return null for fields you cannot confidently identify
- Never invent column names
"""

    try:
        print("=== CALLING OPENAI ===")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,       # deterministic — we want consistent parsing
            response_format={"type": "json_object"}  # force JSON output
        )
        mapping = json.loads(response.choices[0].message.content)
        print(f"OpenAI response: {mapping}")
        return mapping

    except Exception as e:
        print(f"=== OPENAI FAILED — using fallback ===")
        print(f"Reason: {type(e).__name__}: {str(e)}")
        print("======================================")
        # Fallback to rule-based detection instead of crashing
        return detect_columns_fallback(df)
    
def detect_columns_fallback(df: pd.DataFrame) -> dict:
    """
    Rule-based fallback when OpenAI is unavailable.
    Covers common column name patterns from major Indian banks.
    """
    columns_lower = {col.lower(): col for col in df.columns}
    mapping = {
        "date": None, "description": None,
        "debit": None, "credit": None,
        "amount": None, "balance": None
    }

    for col_lower, col_original in columns_lower.items():
        # Date patterns
        if any(k in col_lower for k in ['date', 'dt', 'time']):
            mapping['date'] = col_original

        # Description patterns
        elif any(k in col_lower for k in ['narration', 'description', 'particulars', 'remarks', 'details', 'txn', 'transaction']):
            mapping['description'] = col_original

        # Debit patterns
        elif any(k in col_lower for k in ['withdrawal', 'debit', 'dr', 'payment', 'paid']):
            mapping['debit'] = col_original

        # Credit patterns
        elif any(k in col_lower for k in ['deposit', 'credit', 'cr', 'received']):
            mapping['credit'] = col_original

        # Single amount column
        elif any(k in col_lower for k in ['amount', 'amt']) and not mapping['debit'] and not mapping['credit']:
            mapping['amount'] = col_original

        # Balance patterns
        elif any(k in col_lower for k in ['balance', 'bal', 'closing', 'running']):
            mapping['balance'] = col_original

    # Validate we at least have date and description
    if not mapping['date'] or not mapping['description']:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": "Could not detect column structure. Please ensure this is a valid bank statement."
            }
        )

    return mapping

# ─────────────────────────────────────────────
# DATA NORMALISATION
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

def normalise_dataframe(df: pd.DataFrame, column_map: dict) -> list[dict]:
    """
    Takes raw dataframe and column mapping from GPT.
    Returns list of normalised transaction dicts.
    Skips invalid rows instead of crashing.
    """
    transactions = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            # ── Date ──
            date_col = column_map.get('date')
            if not date_col or pd.isna(row.get(date_col)):
                skipped += 1
                continue

            parsed_date = parse_date(str(row[date_col]))
            if not parsed_date:
                skipped += 1
                continue

            # ── Description ──
            desc_col = column_map.get('description')
            description = str(row[desc_col]).strip() if desc_col else 'Unknown'
            if not description or description.lower() == 'nan':
                description = 'Unknown'

            # ── Amount ──
            # Handle two cases:
            # Case 1: separate debit and credit columns
            # Case 2: single amount column
            debit_col = column_map.get('debit')
            credit_col = column_map.get('credit')
            amount_col = column_map.get('amount')

            amount = None
            transaction_type = None

            if debit_col and credit_col:
                # Try debit first
                debit_val = row.get(debit_col)
                credit_val = row.get(credit_col)

                # Clean string values — remove commas, spaces
                def clean_amount(val) -> Optional[float]:
                    if pd.isna(val):
                        return None
                    cleaned = str(val).replace(',', '').replace(' ', '').strip()
                    if not cleaned or cleaned.lower() == 'nan':
                        return None
                    try:
                        return float(cleaned)
                    except ValueError:
                        return None

                debit = clean_amount(debit_val)
                credit = clean_amount(credit_val)

                if debit and debit > 0:
                    amount = -debit      # debit = money out = negative
                    transaction_type = 'debit'
                elif credit and credit > 0:
                    amount = credit      # credit = money in = positive
                    transaction_type = 'credit'
                else:
                    skipped += 1
                    continue

            elif amount_col:
                raw = row.get(amount_col)
                if pd.isna(raw):
                    skipped += 1
                    continue
                try:
                    amount = float(str(raw).replace(',', '').strip())
                    transaction_type = 'credit' if amount > 0 else 'debit'
                except ValueError:
                    skipped += 1
                    continue
            else:
                skipped += 1
                continue

            if amount is None or amount == 0:
                skipped += 1
                continue

            # ── Balance (optional) ──
            balance = None
            balance_col = column_map.get('balance')
            if balance_col and not pd.isna(row.get(balance_col)):
                try:
                    balance = float(str(row[balance_col]).replace(',', '').strip())
                except ValueError:
                    pass

            transactions.append({
                "transaction_id": str(uuid.uuid4()),
                "date": parsed_date,
                "description": description,
                "amount": round(amount, 2),
                "type": transaction_type,
                "balance": balance
            })

        except Exception:
            # Skip any row that causes an unexpected error
            skipped += 1
            continue

    # Reject if too few valid transactions — likely not a real statement
    if len(transactions) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": f"Only {len(transactions)} valid transactions found. Please ensure this is a valid bank statement."
            }
        )

    return transactions, skipped

# ─────────────────────────────────────────────
# CSV PARSING
# ─────────────────────────────────────────────

def parse_csv(file_bytes: bytes) -> list[dict]:
    """
    Reads CSV bytes into DataFrame.
    Tries UTF-8 first, falls back to latin-1.
    Then runs column detection and normalisation.
    """
    try:
        try:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding='latin-1')

        # Drop completely empty rows and columns
        df = df.dropna(how='all').dropna(axis=1, how='all')

        # Strip whitespace from all string values
        df = df.apply(lambda col: col.str.strip() if col.dtype == 'object' else col)

        # Strip whitespace from column names
        df.columns = df.columns.str.strip()

        print(f"=== CSV PARSE DEBUG ===")
        print(f"Columns after cleaning: {list(df.columns)}")
        print(f"Row count: {len(df)}")
        print("======================")

        if df.empty or len(df.columns) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "parse_failed",
                    "message": "CSV file appears to be empty or invalid."
                }
            )

        # Detect columns using OpenAI
        column_map = detect_columns_with_openai(df)

        # Normalise into standard transaction format
        return normalise_dataframe(df, column_map)

    except HTTPException:
        raise   # re-raise our own exceptions unchanged
    except Exception as e:
        print(f"=== CSV ERROR ===")
        print(f"Error type: {type(e).__name__}")
        print(f"Error: {str(e)}")
        print("=================")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": "Failed to parse CSV file. Please ensure it is a valid bank statement."
            }
        )

# ─────────────────────────────────────────────
# PDF PARSING
# ─────────────────────────────────────────────

def parse_pdf(file_bytes: bytes) -> list[dict]:
    """
    Extracts tables from PDF using pdfplumber.
    Concatenates tables from all pages.
    Then runs same column detection and normalisation as CSV.
    """
    try:
        all_rows = []
        headers = None

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                table = page.extract_table()
                if not table:
                    continue

                # First row of first table is the header
                if headers is None:
                    headers = table[0]
                    rows = table[1:]
                else:
                    # Subsequent pages — skip if first row looks like a header repeat
                    first_row = table[0]
                    if first_row == headers:
                        rows = table[1:]   # skip duplicate header
                    else:
                        rows = table       # no duplicate header

                all_rows.extend(rows)

        if not all_rows or not headers:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "parse_failed",
                    "message": "Could not extract tables from this PDF. If it is a scanned image, please upload a text-based PDF or CSV instead."
                }
            )

        # Build DataFrame from extracted table data
        # Clean up None values from pdfplumber
        cleaned_rows = [
            [cell if cell is not None else '' for cell in row]
            for row in all_rows
        ]
        df = pd.DataFrame(cleaned_rows, columns=headers)

        # Strip whitespace from column names
        df.columns = df.columns.str.strip()

        # Drop empty rows
        df = df.dropna(how='all')
        df = df[df.apply(lambda row: any(str(v).strip() for v in row), axis=1)]

        # Detect columns using OpenAI — same function as CSV
        column_map = detect_columns_with_openai(df)

        return normalise_dataframe(df, column_map)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "parse_failed",
                "message": "Failed to parse PDF file. Please ensure it is a valid bank statement."
            }
        )

# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def parse_statement(file_bytes: bytes, file_type: str) -> list[dict]:
    """
    Routes to correct parser based on file type.
    Returns list of normalised transaction dicts.
    """
    if file_type == 'csv':
        return parse_csv(file_bytes)
    elif file_type == 'pdf':
        return parse_pdf(file_bytes)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_format",
                "message": "Only CSV and PDF files are supported."
            }
        )