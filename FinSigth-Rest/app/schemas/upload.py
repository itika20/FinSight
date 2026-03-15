from pydantic import BaseModel
from datetime import date
from typing import Optional
import uuid

# Single parsed transaction — returned in API response
class ParsedTransaction(BaseModel):
    transaction_id: str
    date: str           # "YYYY-MM-DD" string — easier for frontend
    description: str
    amount: float       # negative = debit, positive = credit
    type: str           # "debit" or "credit"
    balance: Optional[float] = None

# What the upload endpoint returns
class UploadResponse(BaseModel):
    message: str
    upload_id: str
    transaction_count: int
    filename: str
    transactions: list[ParsedTransaction]
    skipped_count: int = 0