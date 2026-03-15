from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class SignupResponse(BaseModel):
    message: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime