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

class Upload(BaseModel):
    id: str
    filename: str
    file_type: str
    transaction_count: int
    status: str
    created_at: str

class UploadListResponse(BaseModel):
    uploads: list[Upload]
    total_count: int

class DeleteUploadResponse(BaseModel):
    message: str
    deleted_transaction_count: int

class NormalizeMerchantsRequest(BaseModel):
    descriptions: list[str]

class NormalizeMerchantsResponse(BaseModel):
    normalized: dict[str, str]   # raw description → clean merchant name

class AccountOpeningBalance(BaseModel):
    upload_id: str
    filename: str
    opening_balance: float

class OpeningBalanceResponse(BaseModel):
    month: str                                    # 'YYYY-MM'
    total_opening_balance: Optional[float]        # None if no balance data in any account
    accounts: list[AccountOpeningBalance]