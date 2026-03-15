from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from app.api.auth import get_current_user
from app.schemas.upload import UploadResponse, ParsedTransaction
from app.services.parsing_service import validate_file, parse_statement

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/statement", response_model=UploadResponse)
async def upload_statement(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)  # protected — JWT required
):
    # Read entire file into memory
    # We do this once and reuse the bytes — never touch disk
    file_bytes = await file.read()
    file_size = len(file_bytes)

    # Validate type and size — raises 400 if invalid
    file_type = validate_file(
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size
    )

    # Parse the file — raises 422 if parsing fails
    transactions = parse_statement(file_bytes, file_type)

    # file_bytes goes out of scope here and gets garbage collected
    # Nothing written to disk at any point

    return UploadResponse(
        message="Statement parsed successfully",
        upload_id="pending",        # will be real UUID when we store to DB later
        transaction_count=len(transactions),
        filename=file.filename,
        transactions=[ParsedTransaction(**t) for t in transactions]
    )