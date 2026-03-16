from typing import Optional
from app.core.database import get_db
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from app.api.auth import get_current_user
from app.schemas.upload import TransactionListResponse, UploadResponse, ParsedTransaction
from app.services.parsing_service import validate_file, parse_statement
from app.services.upload_service import (
    create_upload_record,
    update_upload_success,
    update_upload_failed,
    store_transactions,
    get_transactions
)

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/statement", response_model=UploadResponse)
async def upload_statement(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    user_id = str(current_user['id'])

    # Read file into memory — never touches disk
    file_bytes = await file.read()
    file_size = len(file_bytes)

    # Validate type and size — raises 400 if invalid
    file_type = validate_file(
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size
    )

    # Open ONE database connection for the entire operation
    # This ensures the whole thing is atomic — all or nothing
    with get_db() as conn:
        # Step 1 — Create upload record BEFORE parsing
        # We need the upload_id to associate transactions with this upload
        upload_id = create_upload_record(
            conn,
            user_id=user_id,
            filename=file.filename,
            file_type=file_type
        )

        try:
            # Step 2 — Parse the file (CPU work, no DB)
            transactions, skipped_count = parse_statement(file_bytes, file_type)

            # Step 3 — Bulk store all transactions
            store_transactions(conn, user_id, upload_id, transactions)

            # Step 4 — Mark upload as completed
            update_upload_success(conn, upload_id, len(transactions))

        except HTTPException:
            # Parsing or storage failed — mark upload as failed
            # get_db() will rollback the transaction automatically
            update_upload_failed(conn, upload_id)
            raise   # re-raise the original error to return to frontend

        except Exception:
            update_upload_failed(conn, upload_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "error": "storage_failed",
                    "message": "Failed to store transactions. Please try again."
                }
            )

    return UploadResponse(
        message="Statement uploaded and stored successfully",
        upload_id=upload_id,
        transaction_count=len(transactions),
        skipped_count=skipped_count,
        filename=file.filename,
        transactions=[ParsedTransaction(**t) for t in transactions]
    )

@router.get("/transactions", response_model=TransactionListResponse)
def get_user_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user['id'])

    with get_db() as conn:
        result = get_transactions(
            conn,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            type_filter=type
        )

    return TransactionListResponse(
        transactions=result['transactions'],
        total_count=result['total_count'],
        date_range=result['date_range']
    )