"""
Upload Service - Handles database operations for uploads and transactions.
Manages upload records, transaction storage, and category updates.
"""

import logging
import uuid

from fastapi import HTTPException, status
from psycopg2.extras import execute_values

from app.core.constants import (
    LOGGER_UPLOAD,
    UPLOAD_STATUS_PROCESSING,
    UPLOAD_STATUS_COMPLETED,
    UPLOAD_STATUS_FAILED,
    CONFIDENCE_USER_CONFIRMED,
    TRANSACTION_TYPE_DEBIT,
    TRANSACTION_TYPE_CREDIT
)

# Initialize logger for this module
logger = logging.getLogger(LOGGER_UPLOAD)

# ─────────────────────────────────────────────
# UPLOAD OPERATIONS
# ─────────────────────────────────────────────

def create_upload_record(conn, user_id: str, filename: str, file_type: str) -> str:
    """
    Creates a new upload record in the database.
    Called BEFORE parsing to establish an upload ID and track the operation.
    
    Args:
        conn: Database connection
        user_id: UUID of the user performing the upload
        filename: Original filename from the form submission
        file_type: Type of file (e.g., 'pdf')
        
    Returns:
        str: Generated UUID for this upload record
        
    Note:
        Status starts as 'processing'. Updated to 'completed' or 'failed' after parsing.
        This allows tracking uploads even if parsing fails.
    """
    upload_id = str(uuid.uuid4())
    logger.info(f"Creating upload record: {upload_id} for user {user_id}, file: {filename}")

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO uploads (id, user_id, filename, file_type, status, transaction_count)
            VALUES (%s, %s, %s, %s, %s, 0)
            """,
            (upload_id, user_id, filename, file_type, UPLOAD_STATUS_PROCESSING)
        )
    
    logger.debug(f"Upload record created: {upload_id}")
    return upload_id

def update_upload_success(conn, upload_id: str, transaction_count: int):
    """
    Marks an upload as successfully completed.
    Called after all transactions have been stored in the database.
    
    Args:
        conn: Database connection
        upload_id: UUID of the upload record
        transaction_count: Final number of transactions stored
        
    Note:
        Transaction-safe: Changes are committed when the database context exits.
    """
    logger.info(f"Marking upload {upload_id} as completed with {transaction_count} transactions")
    
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE uploads
            SET status = %s, transaction_count = %s
            WHERE id = %s
            """,
            (UPLOAD_STATUS_COMPLETED, transaction_count, upload_id)
        )
    
    logger.debug(f"Upload {upload_id} status updated to completed")

def update_upload_failed(conn, upload_id: str):
    """
    Marks an upload as failed.
    Called when parsing or transaction storage encounters an error.
    
    Args:
        conn: Database connection
        upload_id: UUID of the upload record
        
    Note:
        The parent transaction will be rolled back, but this update marks the upload
        as failed so users can see what went wrong in their upload history.
    """
    logger.warning(f"Marking upload {upload_id} as failed")
    
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE uploads
            SET status = %s
            WHERE id = %s
            """,
            (UPLOAD_STATUS_FAILED, upload_id)
        )
    
    logger.debug(f"Upload {upload_id} status updated to failed")

# ─────────────────────────────────────────────
# TRANSACTION OPERATIONS
# ─────────────────────────────────────────────

def store_transactions(conn, user_id: str, upload_id: str, transactions: list[dict]):
    """
    Bulk inserts all parsed transactions into the database.
    Uses psycopg2's execute_values() for efficient bulk operations.
    Much faster than looping and calling execute() per row.
    
    Args:
        conn: Database connection
        user_id: UUID of the user who owns these transactions
        upload_id: UUID of the upload record to link transactions to
        transactions: List of transaction dicts from the parser
        
    Note:
        Empty transaction list is silently skipped (no-op).
        Transaction is atomic: all transactions are stored or none are.
        Missing optional fields (category, confidence) default to NULL.
    """
    if not transactions:
        logger.debug("No transactions to store (empty list)")
        return

    logger.info(f"Storing {len(transactions)} transactions for user {user_id}, upload {upload_id}")

    # ── Build list of tuples — one per transaction
    # Order MUST match INSERT column order below
    values = [
        (
            row['transaction_id'],      # id
            user_id,                    # user_id
            upload_id,                  # upload_id
            row['date'],                # date
            row['description'],         # description
            row['amount'],              # amount
            row['type'],                # type
            row.get('balance'),         # balance (optional)
            row.get('category'),        # category (optional)
            row.get('confidence'),      # confidence (optional)
        )
        for row in transactions
    ]

    with conn.cursor() as cursor:
        try:
            execute_values(
                cursor,
                """
                INSERT INTO transactions
                    (id, user_id, upload_id, date, description, amount, type, balance, category, confidence)
                VALUES %s
                """,
                values
            )
            logger.debug(f"Successfully inserted {len(transactions)} transactions")
        except Exception as e:
            logger.error(f"Failed to store transactions: {type(e).__name__}: {e}")
            raise

def get_transactions(
    conn,
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    type_filter: str = None
) -> dict:
    """
    Fetches transactions for a user with optional date and type filters.
    Also computes date range and total count in a single optimized query.
    
    Args:
        conn: Database connection
        user_id: UUID of user whose transactions to fetch
        start_date: Filter transactions from this date (YYYY-MM-DD), optional
        end_date: Filter transactions until this date (YYYY-MM-DD), optional
        type_filter: Filter by 'debit' or 'credit', optional
        
    Returns:
        dict with keys:
            - transactions: List of transaction dicts
            - total_count: Total matching transactions
            - date_range: Dict with 'from' and 'to' dates
            
    Note:
        Results are ordered newest first (ORDER BY date DESC).
        Uses MIN/MAX with COUNT to get stats in one database query.
    """
    logger.info(f"Fetching transactions for user {user_id}")
    
    # ── Step 1: Get aggregates (date range and total count)
    # Efficient: Single query with MIN/MAX aggregates instead of Python loops
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
    
    logger.debug(f"Stats: {total_count} transactions, date range {from_date} to {to_date}")

    # ── Step 2: Build dynamic filtered query
    # Only include filter clauses that have actual values (parametric query safety)
    query = """
        SELECT
            id as transaction_id,
            date,
            description,
            amount,
            type,
            balance,
            category,
            confidence
        FROM transactions
        WHERE user_id = %s
    """
    params = [user_id]

    # Add optional filters only if provided
    if start_date:
        query += " AND date >= %s"
        params.append(start_date)
        logger.debug(f"Added start_date filter: {start_date}")

    if end_date:
        query += " AND date <= %s"
        params.append(end_date)
        logger.debug(f"Added end_date filter: {end_date}")

    # Validate type_filter against known values
    if type_filter and type_filter in (TRANSACTION_TYPE_DEBIT, TRANSACTION_TYPE_CREDIT):
        query += " AND type = %s"
        params.append(type_filter)
        logger.debug(f"Added type filter: {type_filter}")

    query += " ORDER BY date DESC"

    # ── Step 3: Fetch and normalize results
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    # Convert psycopg2 RealDictRow objects to plain dicts
    # Also ensure date is returned as string for JSON serialization
    transactions = []
    for row in rows:
        t = dict(row)
        t['transaction_id'] = str(t['transaction_id'])
        t['date'] = str(t['date'])
        transactions.append(t)

    logger.debug(f"Fetched {len(transactions)} transactions")
    
    return {
        "transactions": transactions,
        "total_count": total_count,
        "date_range": {
            "from": from_date,
            "to": to_date
        }
    }

# ─────────────────────────────────────────────
# CATEGORY OPERATIONS
# ─────────────────────────────────────────────

def update_transaction_category(
    conn,
    transaction_id: str,
    user_id: str,
    category: str
) -> dict | None:
    """
    Updates the category for a single transaction.
    Called when user manually categorizes a transaction from the dashboard.
    
    Args:
        conn: Database connection
        transaction_id: UUID of transaction to categorize
        user_id: UUID of user (security check to ensure user owns transaction)
        category: New category string
        
    Returns:
        dict: Transaction row with id and description (needed to extract VPA for ML)
        None: If transaction not found or doesn't belong to user
        
    Security:
        Only allows updating transactions the user owns (checks both transaction_id and user_id).
    """
    logger.info(f"Updating category for transaction {transaction_id}: {category}")
    
    with conn.cursor() as cursor:
        # ── Step 1: Fetch transaction — confirms ownership and gets description
        cursor.execute(
            """
            SELECT id, description FROM transactions
            WHERE id = %s AND user_id = %s
            """,
            (transaction_id, user_id)
        )
        row = cursor.fetchone()

        if not row:
            logger.warning(f"Transaction {transaction_id} not found for user {user_id}")
            return None

        # ── Step 2: Update category and mark as user-confirmed
        # User-confirmed categories override auto-categorization
        cursor.execute(
            """
            UPDATE transactions
            SET category = %s, confidence = %s
            WHERE id = %s AND user_id = %s
            """,
            (category, CONFIDENCE_USER_CONFIRMED, transaction_id, user_id)
        )
        logger.debug(f"Category updated for {transaction_id}")

    return dict(row)


def list_uploads(conn, user_id: str) -> list[dict]:
    """
    Returns all completed uploads for a user, newest first.
    Only returns uploads with status='completed' (skips failed/processing).
    """
    logger.info(f"Listing uploads for user {user_id}")
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, filename, file_type, created_at, transaction_count, status
            FROM uploads
            WHERE user_id = %s AND status = %s
            ORDER BY created_at DESC
            """,
            (user_id, UPLOAD_STATUS_COMPLETED)
        )
        rows = cursor.fetchall()

    result = [
        {
            'id': str(row['id']),
            'filename': row['filename'],
            'file_type': row['file_type'] or 'pdf',
            'created_at': str(row['created_at']),
            'transaction_count': row['transaction_count'] or 0,
            'status': row['status'],
        }
        for row in rows
    ]
    logger.debug(f"Found {len(result)} completed uploads for user {user_id}")
    return result


def delete_upload(conn, user_id: str, upload_id: str) -> dict | None:
    """
    Deletes an upload record and all its transactions.
    VPA memory (user_vpa_memory) is intentionally left intact.

    Returns dict with deleted_transaction_count, or None if not found.
    """
    logger.info(f"Deleting upload {upload_id} for user {user_id}")
    with conn.cursor() as cursor:
        # Verify ownership first
        cursor.execute(
            "SELECT id FROM uploads WHERE id = %s AND user_id = %s",
            (upload_id, user_id)
        )
        if not cursor.fetchone():
            logger.warning(f"Upload {upload_id} not found for user {user_id}")
            return None

        # Count transactions before deleting (for response body)
        cursor.execute(
            "SELECT COUNT(*) AS cnt FROM transactions WHERE upload_id = %s AND user_id = %s",
            (upload_id, user_id)
        )
        count_row = cursor.fetchone()
        deleted_count = int(count_row['cnt']) if count_row else 0

        # Delete transactions belonging to this upload
        cursor.execute(
            "DELETE FROM transactions WHERE upload_id = %s AND user_id = %s",
            (upload_id, user_id)
        )
        logger.debug(f"Deleted {deleted_count} transactions for upload {upload_id}")

        # Delete the upload record itself
        cursor.execute(
            "DELETE FROM uploads WHERE id = %s AND user_id = %s",
            (upload_id, user_id)
        )
        logger.info(f"Upload {upload_id} deleted successfully ({deleted_count} transactions)")

    return {'deleted_transaction_count': deleted_count}


def bulk_update_categories(
    conn,
    updates: list[tuple[str, str, str]]   # (transaction_id, category, confidence)
):
    """
    Bulk updates categories for multiple transactions.
    Efficient for processing categorization results from ML models.
    
    Args:
        conn: Database connection
        updates: List of tuples (transaction_id, category, confidence)
        
    Note:
        Empty updates list is silently skipped (no-op).
        Each update is a separate transaction. Consider using a batch for atomic updates.
    """
    if not updates:
        logger.debug("No category updates to apply (empty list)")
        return

    logger.info(f"Bulk updating categories for {len(updates)} transactions")
    
    with conn.cursor() as cursor:
        for transaction_id, category, confidence in updates:
            try:
                cursor.execute(
                    """
                    UPDATE transactions
                    SET category = %s, confidence = %s
                    WHERE id = %s
                    """,
                    (category, confidence, transaction_id)
                )
                logger.debug(f"Updated {transaction_id}: {category} ({confidence})")
            except Exception as e:
                logger.error(f"Failed to update {transaction_id}: {e}")
                raise
    
    logger.debug(f"Bulk category update complete")