import uuid
from psycopg2.extras import execute_values
from fastapi import HTTPException, status

# ─────────────────────────────────────────────
# UPLOAD OPERATIONS
# ─────────────────────────────────────────────

def create_upload_record(conn, user_id: str, filename: str, file_type: str) -> str:
    """
    Inserts a new upload record with status 'processing'.
    Returns the generated upload_id.
    We create this BEFORE parsing so we have an ID to reference.
    If parsing fails, we update status to 'failed'.
    """
    upload_id = str(uuid.uuid4())

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO uploads (id, user_id, filename, file_type, status, transaction_count)
            VALUES (%s, %s, %s, %s, 'processing', 0)
            """,
            (upload_id, user_id, filename, file_type)
        )

    return upload_id

def update_upload_success(conn, upload_id: str, transaction_count: int):
    """
    Called after successful parse and store.
    Marks upload as completed with final transaction count.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE uploads
            SET status = 'completed', transaction_count = %s
            WHERE id = %s
            """,
            (transaction_count, upload_id)
        )

def update_upload_failed(conn, upload_id: str):
    """
    Called when parsing or storing fails.
    Marks upload as failed so user knows something went wrong.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE uploads
            SET status = 'failed'
            WHERE id = %s
            """,
            (upload_id,)
        )

# ─────────────────────────────────────────────
# TRANSACTION OPERATIONS
# ─────────────────────────────────────────────

def store_transactions(conn, user_id: str, upload_id: str, transactions: list[dict]):
    """
    Bulk inserts all transactions in a single query.
    execute_values is psycopg2's efficient bulk insert method.
    Much faster than looping and calling execute() per row.
    """
    if not transactions:
        return

    # Build list of tuples — one per transaction
    # Order must match the INSERT column order exactly
    values = [
        (
            row['transaction_id'],  # id
            user_id,                # user_id
            upload_id,              # upload_id
            row['date'],            # date
            row['description'],     # description
            row['amount'],          # amount
            row['type'],            # type
            row.get('balance'),     # balance — None if not present
        )
        for row in transactions
    ]

    with conn.cursor() as cursor:
        execute_values(
            cursor,
            """
            INSERT INTO transactions
                (id, user_id, upload_id, date, description, amount, type, balance)
            VALUES %s
            """,
            values
        )

def get_transactions(
    conn,
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    type_filter: str = None
) -> dict:
    """
    Fetches transactions for a user with optional filters.
    Also returns total count and date range in a single query.
    """
    # ── Step 1: Get date range and total count ──
    # MIN/MAX aggregates — one query, no Python calculation needed
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                COUNT(*) as total_count,
                MIN(date) as from_date,
                MAX(date) as to_date
            FROM transactions
            WHERE user_id = %s
            """,
            (user_id,)
        )
        stats = cursor.fetchone()

    total_count = stats['total_count'] if stats else 0
    from_date = str(stats['from_date']) if stats and stats['from_date'] else None
    to_date = str(stats['to_date']) if stats and stats['to_date'] else None

    # ── Step 2: Build dynamic filtered query ──
    query = """
        SELECT
            id as transaction_id,
            date,
            description,
            amount,
            type,
            balance,
            category,
            anomaly_score,
            is_anomaly
        FROM transactions
        WHERE user_id = %s
    """
    params = [user_id]

    # Only add filter clauses that have actual values
    if start_date:
        query += " AND date >= %s"
        params.append(start_date)

    if end_date:
        query += " AND date <= %s"
        params.append(end_date)

    if type_filter and type_filter in ('debit', 'credit'):
        query += " AND type = %s"
        params.append(type_filter)

    query += " ORDER BY date DESC"

    with conn.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    # Convert rows to list of dicts with date as string
    transactions = []
    for row in rows:
        t = dict(row)
        t['transaction_id'] = str(t['transaction_id'])
        t['date'] = str(t['date'])
        transactions.append(t)

    return {
        "transactions": transactions,
        "total_count": total_count,
        "date_range": {
            "from": from_date,
            "to": to_date
        }
    }