"""
Upload API Endpoints - Bank Statement File Processing

Handles:
1. POST /upload/statement — Accept PDF file, parse, extract transactions
2. GET /upload/transactions — List all user transactions with optional filters
3. PATCH /upload/transactions/{id}/category — User confirms/corrects category
4. POST /upload/transactions/recategorise — Re-run ML categorisation on all transactions

Security:
- All endpoints require authentication (JWT token via get_current_user)
- All queries limit to current user's data
- User cannot access other users' transactions
"""

import json
import logging
from typing import Optional
from app.core.database import get_db
from app.core.config import settings
from app.core.constants import (
    LOGGER_UPLOAD,
    VALID_TRANSACTION_CATEGORIES,
    ERROR_INVALID_CATEGORY,
    ERROR_TRANSACTION_NOT_FOUND,
)
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from app.api.auth import get_current_user
from app.schemas.upload import (
    CategoryUpdateRequest, CategoryUpdateResponse, TransactionListResponse,
    UploadResponse, ParsedTransaction, UploadListResponse, DeleteUploadResponse,
    NormalizeMerchantsRequest, NormalizeMerchantsResponse,
)
from openai import OpenAI
from app.services.parsing_service import validate_file, parse_statement
from app.services.upload_service import (
    create_upload_record,
    update_upload_success,
    update_upload_failed,
    store_transactions,
    get_transactions,
    update_transaction_category,
    bulk_update_categories,
    list_uploads,
    delete_upload,
)
from app.services.categorise import (
    categorise_transaction,
    extract_vpa,
    save_vpa_memory
)

# Initialize logger for this API module
logger = logging.getLogger(LOGGER_UPLOAD)

# Create router for /upload endpoints
router = APIRouter(prefix="/upload", tags=["upload"])

# ============================================================================
# ENDPOINT 1: Upload Bank Statement PDF
# ============================================================================

@router.post("/statement", response_model=UploadResponse)
async def upload_statement(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    """
    Upload Bank Statement PDF - Parse and extract transactions.

    The complete upload flow:
    1. User selects PDF file from frontend (DropZone component)
    2. Frontend validates file type and size locally
    3. POST /upload/statement with file as multipart/form-data
    4. Backend validates file again (defense in depth)
    5. Creates upload record in DB (tracks upload metadata)
    6. Parses PDF text → transactions (via parse_statement)
    7. Runs ML categorisation on each transaction
    8. Stores transactions in DB (bulk insert)
    9. Updates upload status to COMPLETED
    10. Returns all transactions to frontend
    11. Frontend displays parsed data for user review

    Parsing Duration:
    - PDF reading: < 1 second
    - GPT-4o API calls: 15-30 seconds (main bottleneck)
    - DB storage: 1-2 seconds
    - Total: 20-35 seconds

    Error Handling:
    - File validation fails (400) — wrong type or too large
    - PDF parsing fails (422) — invalid or empty file
    - DB storage fails (500) — upload marked failed
    - All: automatic transaction rollback via get_db()

    Args:
        file: PDF file from user (multipart/form-data upload)
        current_user: Authenticated user from JWT token

    Returns:
        UploadResponse with:
        - upload_id: UUID of this upload batch
        - transaction_count: Number of successfully parsed transactions
        - skipped_count: Number of rows skipped due to errors
        - transactions: List of Transaction objects
        - message: Success message

    Raises:
        HTTPException 400 — file not PDF or invalid MIME type
        HTTPException 413 — file size > 10MB
        HTTPException 422 — PDF parsing failed (invalid/empty file)
        HTTPException 500 — database storage error

    Security:
        - JWT token required (get_current_user)
        - Only current user can upload to their account
        - All transactions associated with current_user.id

    Example Response:
        {
            "message": "Statement uploaded and stored successfully",
            "upload_id": "550e8400-e29b-41d4-a716-446655440000",
            "transaction_count": 47,
            "skipped_count": 2,
            "filename": "statement_march_2026.pdf",
            "transactions": [
                {
                    "transaction_id": "txn_001",
                    "date": "2026-03-01",
                    "description": "AMAZON.IN",
                    "amount": 2500.50,
                    "type": "debit",
                    "category": "Shopping",
                    "confidence": 0.95
                },
                ...
            ]
        }
    """
    user_id = str(current_user['id'])
    logger.info(f"Upload started: user={user_id}, file={file.filename}")

    # Read file into memory (never persists to disk)
    file_bytes = await file.read()
    file_size = len(file_bytes)
    logger.debug(f"File read into memory: {file_size} bytes")

    # Validate file type and size (raises HTTPException if invalid)
    # This is second validation — frontend did first, but validate here for security
    file_type = validate_file(
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size
    )
    logger.debug(f"File validation passed: type={file_type}")

    # Open single database connection for entire operation
    # This ensures atomicity: all transactions stored or none (rollback on error)
    with get_db() as conn:
        logger.debug(f"Database connection opened for upload")

        # STEP 1: Create upload record
        # This tracks the upload metadata and marks status as PROCESSING
        # upload_id links all transactions from this batch
        upload_id = create_upload_record(
            conn,
            user_id=user_id,
            filename=file.filename,
            file_type=file_type
        )
        logger.info(f"Upload record created: id={upload_id}")

        try:
            # STEP 2: Parse PDF file
            # Extracts text, chunks by 3 pages, calls GPT-4o for each chunk
            # GPT-4o returns structured transaction data
            # Takes 15-30 seconds (API latency)
            logger.debug(f"Starting PDF parsing for {file_size} bytes...")
            transactions, skipped_count = parse_statement(file_bytes, file_type)
            logger.info(f"PDF parsed: {len(transactions)} transactions, {skipped_count} skipped")

            # STEP 3: Run ML categorisation on each transaction
            # extract_vpa() finds merchant VPA patterns
            # categorise_transaction() uses VPA memory + GPT to apply category
            logger.debug(f"Starting categorisation for {len(transactions)} transactions...")
            for txn in transactions:
                category, confidence = categorise_transaction(
                    description=txn['description'],
                    amount=txn['amount'],
                    user_id=user_id
                )
                txn['category'] = category
                txn['confidence'] = confidence

            categorised = sum(1 for t in transactions if t.get('category') != 'Uncategorised')
            logger.info(f"Categorisation complete: {categorised}/{len(transactions)} categorised")

            # STEP 4: Store all transactions in database
            # Uses psycopg2.execute_values() for bulk insert (efficient)
            # Transaction already open via get_db() context manager
            logger.debug(f"Storing {len(transactions)} transactions to database...")
            store_transactions(conn, user_id, upload_id, transactions)
            logger.debug(f"Transactions stored successfully")

            # STEP 5: Mark upload as complete
            # Sets status to COMPLETED, stores transaction count
            update_upload_success(conn, upload_id, len(transactions))
            logger.info(f"Upload marked successful: {len(transactions)} transactions")

        except HTTPException as e:
            # Parsing or storage failed — mark upload record as failed
            # HTTP exceptions pass through (401, 422, etc.)
            logger.warning(f"Upload failed with HTTPException: {e.status_code} — {e.detail}")
            update_upload_failed(conn, upload_id)
            raise  # Re-raise to return to frontend

        except Exception as e:
            # Unexpected error — mark upload failed and wrap in HTTPException
            logger.error(f"Upload failed with exception: {type(e).__name__}: {e}")
            update_upload_failed(conn, upload_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store transactions. Please try again."
            )

    # Success — return all parsed transactions to frontend
    logger.info(f"Upload completed successfully: {len(transactions)} transactions returned")
    return UploadResponse(
        message="Statement uploaded and stored successfully",
        upload_id=upload_id,
        transaction_count=len(transactions),
        skipped_count=skipped_count,
        filename=file.filename,
        transactions=[ParsedTransaction(**t) for t in transactions]
    )


# ============================================================================
# ENDPOINT 2: Get User Transactions
# ============================================================================

@router.get("/transactions", response_model=TransactionListResponse)
def get_user_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
    Get All User Transactions - With optional date and type filtering.

    Returns all transactions for authenticated user.
    Can filter by date range (start_date/end_date) and type (debit/credit).

    Query Examples:
    - GET /upload/transactions
      → All transactions for user
    
    - GET /upload/transactions?start_date=2026-03-01&end_date=2026-03-31
      → March 2026 transactions
    
    - GET /upload/transactions?type=debit
      → All expenses (debit)
    
    - GET /upload/transactions?type=credit&start_date=2026-03-01
      → Income (credit) from March 1 onwards

    Args:
        start_date: Optional filter (YYYY-MM-DD format)
        end_date: Optional filter (YYYY-MM-DD format)
        type: Optional filter ('debit' or 'credit')
        current_user: Authenticated user from JWT token

    Returns:
        TransactionListResponse with:
        - transactions: List of Transaction objects matching filters
        - total_count: Total number of transactions (all, not just filtered)
        - date_range: Object with min_date and max_date of all user transactions

    Security:
        - JWT token required
        - Only returns current user's transactions
        - Parametric queries prevent SQL injection

    Example Response:
        {
            "transactions": [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "upload_id": "550e8400-e29b-41d4-a716-446655440001",
                    "user_id": "550e8400-e29b-41d4-a716-446655440002",
                    "date": "2026-03-15",
                    "description": "STARBUCKS",
                    "amount": 450.00,
                    "type": "debit",
                    "category": "Food",
                    "confidence": 0.92
                },
                ...
            ],
            "total_count": 147,
            "date_range": {
                "min_date": "2026-01-01",
                "max_date": "2026-03-31"
            }
        }
    """
    user_id = str(current_user['id'])

    if start_date:
        logger.debug(f"Filter: start_date={start_date}")
    if end_date:
        logger.debug(f"Filter: end_date={end_date}")
    if type:
        logger.debug(f"Filter: type={type}")

    logger.info(f"Fetching transactions for user={user_id}")

    # Query database for transactions (with optional filters)
    with get_db() as conn:
        result = get_transactions(
            conn,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            type_filter=type
        )

    logger.info(f"Returned {len(result['transactions'])} transactions (total: {result['total_count']})")
    return TransactionListResponse(
        transactions=result['transactions'],
        total_count=result['total_count'],
        date_range=result['date_range']
    )


# ============================================================================
# ENDPOINT 3: Update Transaction Category
# ============================================================================

@router.patch("/transactions/{transaction_id}/category", response_model=CategoryUpdateResponse)
def update_category(
    transaction_id: str,
    body: CategoryUpdateRequest,
    current_user=Depends(get_current_user)
):
    """
    Update Transaction Category - User confirms or corrects category.

    When user selects a category from the dashboard dropdown:
    1. Update transaction's category in database
    2. Mark confidence as 'user_confirmed'
    3. Extract VPA (Virtual Payment Address) from merchant description
    4. Save VPA → Category mapping to user_vpa_memory
       (Next uploads will auto-categorise this merchant)

    VPA Memory:
    - Extracts UPI/Paytm ID patterns from description
    - Saves mapping: vpa → category (user-provided)
    - Future transactions from same merchant get this category
    - Example: If user categorises "PAYTM-123XYZABC" as "Entertainment"
               Future transactions from PAYTM-123XYZABC auto → Entertainment

    Args:
        transaction_id: UUID of transaction to update
        body: {'category': str, 'merchant_hint': Optional[str]}
        current_user: Authenticated user from JWT token

    Returns:
        CategoryUpdateResponse with:
        - message: Success message
        - transaction_id: Updated transaction ID
        - category: Category that was set
        - vpa_saved: Boolean indicating if VPA was extracted and saved

    Raises:
        HTTPException 400 — category not in VALID_CATEGORIES
        HTTPException 404 — transaction not found (or doesn't belong to user)
        HTTPException 500 — database error

    Security:
        - JWT token required
        - Only user who owns transaction can update it
        - Validates category against whitelist

    Example Request Body:
        {
            "category": "Entertainment",
            "merchant_hint": "Paytm Movie Booking"
        }

    Example Response:
        {
            "message": "Category updated successfully",
            "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
            "category": "Entertainment",
            "vpa_saved": true
        }
    """
    user_id = str(current_user['id'])
    logger.info(f"Update category requested: user={user_id}, txn={transaction_id}, category={body.category}")

    # Validate category is in our approved list
    # Prevents typos and ensures consistency
    if body.category not in VALID_TRANSACTION_CATEGORIES:
        logger.warning(f"Invalid category: {body.category}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_INVALID_CATEGORY.format(
                valid_categories=', '.join(sorted(VALID_TRANSACTION_CATEGORIES))
            )
        )

    logger.debug(f"Category {body.category} is valid, updating database...")

    # Update transaction category in database
    with get_db() as conn:
        row = update_transaction_category(
            conn,
            transaction_id=transaction_id,
            user_id=user_id,
            category=body.category
        )

    # Check if transaction was actually updated (exists and belongs to user)
    if not row:
        logger.warning(f"Transaction not found: {transaction_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_TRANSACTION_NOT_FOUND
        )

    logger.info(f"Transaction category updated: {body.category}")

    # Extract VPA from transaction description and save to user's VPA memory
    # This enables future auto-categorisation for same merchant
    vpa = extract_vpa(row['description'])
    vpa_saved = False

    if vpa:
        logger.debug(f"VPA extracted: {vpa}, saving to memory...")
        save_vpa_memory(
            user_id=user_id,
            vpa=vpa,
            category=body.category,
            merchant_hint=body.merchant_hint
        )
        vpa_saved = True
        logger.info(f"VPA memory saved: {vpa} → {body.category}")
    else:
        logger.debug(f"No VPA found in description: {row['description']}")

    return CategoryUpdateResponse(
        message="Category updated successfully",
        transaction_id=transaction_id,
        category=body.category,
        vpa_saved=vpa_saved
    )


# ============================================================================
# ENDPOINT 4: Recategorise All Transactions
# ============================================================================

@router.post("/transactions/recategorise")
def recategorise_transactions(current_user=Depends(get_current_user)):
    """
    Recategorise All Transactions - Re-run ML on existing transactions.

    Useful when:
    - User has corrected several categories manually
    - New VPA patterns learned (saved to vpa_memory)
    - Want to apply these patterns retroactively to older transactions
    - Old transactions were marked 'Uncategorised' or low confidence

    Logic:
    - Fetches all non-confirmed transactions for user
    - Re-runs categorise_transaction() on each
    - Uses updated VPA memory (includes user corrections)
    - Bulk updates database with new categories
    - Does NOT override user_confirmed transactions

    Duration:
    - 50 transactions: ~2-3 seconds
    - 500 transactions: ~15-20 seconds
    - GPT-4o API calls: main processing

    Args:
        current_user: Authenticated user from JWT token

    Returns:
        JSON with:
        - message: Description of what was updated
        - updated: Count of transactions that were recategorised

    Security:
        - JWT token required
        - Only processes current user's transactions
        - Respects user_confirmed flag (doesn't override)

    Example Response:
        {
            "message": "Recategorised 23 transactions",
            "updated": 23
        }

    Example Response (no changes):
        {
            "message": "No transactions to recategorise",
            "updated": 0
        }
    """
    user_id = str(current_user['id'])
    logger.info(f"Recategorisation requested for user={user_id}")

    # Fetch all transactions that are NOT user-confirmed
    # These are eligible for re-categorisation based on new VPA memory
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, description, amount
                FROM transactions
                WHERE user_id = %s
                AND (
                    confidence IS NULL
                    OR confidence != 'user_confirmed'
                )
                ORDER BY date DESC
                """,
                (user_id,)
            )
            rows = cursor.fetchall()

    logger.info(f"Found {len(rows)} non-confirmed transactions to recategorise")

    if not rows:
        logger.info(f"No transactions to recategorise for user={user_id}")
        return {
            "message": "No transactions to recategorise",
            "updated": 0
        }

    # Re-run categorisation on each transaction
    # Uses updated VPA memory (from user corrections)
    logger.debug(f"Running categorisation on {len(rows)} transactions...")
    updates = []
    for row in rows:
        category, confidence = categorise_transaction(
            description=row['description'],
            amount=float(row['amount']),
            user_id=user_id
        )
        updates.append((str(row['id']), category, confidence))

    # Bulk update all categories in database
    logger.debug(f"Bulk updating {len(updates)} transaction categories...")
    with get_db() as conn:
        bulk_update_categories(conn, updates)

    logger.info(f"Recategorisation complete: {len(updates)} transactions updated")
    return {
        "message": f"Recategorised {len(updates)} transactions",
        "updated": len(updates)
    }


# ============================================================================
# ENDPOINT 5: List Upload History
# ============================================================================

@router.get("/uploads", response_model=UploadListResponse)
def get_uploads(current_user=Depends(get_current_user)):
    """
    List all completed statement uploads for the authenticated user.
    Returns uploads newest-first with filename, date, and transaction count.
    """
    user_id = str(current_user['id'])
    logger.info(f"Listing uploads for user={user_id}")
    with get_db() as conn:
        uploads = list_uploads(conn, user_id)
    logger.info(f"Returning {len(uploads)} uploads for user={user_id}")
    return UploadListResponse(uploads=uploads, total_count=len(uploads))


# ============================================================================
# ENDPOINT 6: Delete Upload (transactions only, VPA memory preserved)
# ============================================================================

@router.delete("/uploads/{upload_id}", response_model=DeleteUploadResponse)
def delete_upload_endpoint(
    upload_id: str,
    current_user=Depends(get_current_user)
):
    """
    Delete an upload record and all its transactions.
    VPA memory (learned merchant→category mappings) is intentionally preserved.
    Returns deleted_transaction_count on success, 404 if not found.
    """
    user_id = str(current_user['id'])
    logger.info(f"Delete upload requested: user={user_id}, upload={upload_id}")
    with get_db() as conn:
        result = delete_upload(conn, user_id, upload_id)
    if result is None:
        logger.warning(f"Upload {upload_id} not found for user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found."
        )
    logger.info(f"Upload {upload_id} deleted: {result['deleted_transaction_count']} transactions removed")
    return DeleteUploadResponse(
        message="Upload deleted successfully.",
        deleted_transaction_count=result['deleted_transaction_count']
    )


# ============================================================================
# ENDPOINT 7: Normalize Merchant Names via OpenAI
# ============================================================================

@router.post("/normalize-merchants", response_model=NormalizeMerchantsResponse)
async def normalize_merchants(
    body: NormalizeMerchantsRequest,
    current_user=Depends(get_current_user)
):
    """
    Given a list of raw transaction descriptions, return a mapping of each
    description to a clean merchant/brand name using GPT-4o-mini.

    Descriptions are sent in a single batch request to minimise latency and cost.
    The caller is expected to deduplicate descriptions before calling.
    """
    if not body.descriptions:
        return NormalizeMerchantsResponse(normalized={})

    # TODO: OpenAI call commented out to avoid charges — uncomment when ready
    # logger.info(f"Normalizing {len(body.descriptions)} merchant descriptions")
    #
    # prompt = (
    #     "You are a financial data processor specialising in Indian bank transactions.\n"
    #     "Given the following raw transaction description strings (from bank statements), "
    #     "return a JSON object that maps each description exactly to a clean merchant or brand name.\n\n"
    #     "Rules:\n"
    #     "- Use the well-known brand name when recognizable (e.g. 'Zomato', 'Amazon', 'Netflix').\n"
    #     "- For UPI transfers to individuals (e.g. 'UPI/johndoe@okaxis'), return 'UPI Transfer'.\n"
    #     "- For bank/NEFT/IMPS/RTGS transfers with no clear merchant, return 'Bank Transfer'.\n"
    #     "- For ATM withdrawals, return 'ATM Withdrawal'.\n"
    #     "- For unrecognizable entries, return a short clean label (max 25 characters).\n"
    #     "- Every input description must appear as a key in the output JSON.\n"
    #     "- Return only valid JSON — no markdown, no explanation.\n\n"
    #     f"Descriptions:\n{json.dumps(body.descriptions, ensure_ascii=False)}"
    # )
    #
    # try:
    #     client = OpenAI(api_key=settings.OPENAI_API_KEY)
    #     response = client.chat.completions.create(
    #         model="gpt-4o-mini",
    #         messages=[{"role": "user", "content": prompt}],
    #         response_format={"type": "json_object"},
    #         temperature=0,
    #     )
    #     raw = response.choices[0].message.content or "{}"
    #     normalized: dict[str, str] = json.loads(raw)
    #
    #     # Ensure every requested description has an entry (fallback to truncated raw)
    #     for desc in body.descriptions:
    #         if desc not in normalized:
    #             normalized[desc] = desc[:28] + "…" if len(desc) > 28 else desc
    #
    #     logger.info(f"Normalized {len(normalized)} descriptions successfully")
    #     return NormalizeMerchantsResponse(normalized=normalized)
    #
    # except Exception as e:
    #     logger.error(f"Merchant normalization failed: {e}")
    #     fallback = {d: (d[:28] + "…" if len(d) > 28 else d) for d in body.descriptions}
    #     return NormalizeMerchantsResponse(normalized=fallback)

    # Temporary passthrough — returns descriptions as-is until OpenAI is re-enabled
    passthrough = {d: (d[:28] + "…" if len(d) > 28 else d) for d in body.descriptions}
    return NormalizeMerchantsResponse(normalized=passthrough)