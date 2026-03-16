from pydantic import BaseModel
from datetime import date
from typing import Optional
import uuid

# Single parsed transaction — returned in API response
class ParsedTransaction(BaseModel):
    transaction_id: str
    date: str
    description: str
    amount: float
    type: str
    balance: Optional[float] = None
    category: Optional[str] = None
    anomaly_score: Optional[float] = None
    is_anomaly: Optional[bool] = None

# What the upload endpoint returns
class UploadResponse(BaseModel):
    message: str
    upload_id: str          # real UUID now
    transaction_count: int
    skipped_count: int      # added
    filename: str
    transactions: list[ParsedTransaction]

class TransactionListResponse(BaseModel):
    transactions: list[ParsedTransaction]
    total_count: int
    date_range: dict   