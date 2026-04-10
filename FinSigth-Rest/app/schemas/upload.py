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
    confidence: Optional[str] = None 

# What the upload endpoint returns
class UploadResponse(BaseModel):
    message: str
    upload_id: str          
    transaction_count: int
    skipped_count: int      
    filename: str
    transactions: list[ParsedTransaction]

class TransactionListResponse(BaseModel):
    transactions: list[ParsedTransaction]
    total_count: int
    date_range: dict   

class CategoryUpdateRequest(BaseModel):
    category: str
    merchant_hint: Optional[str] = None   

class CategoryUpdateResponse(BaseModel):
    message: str
    transaction_id: str
    category: str
    vpa_saved: bool                 