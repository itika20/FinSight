from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import get_db
from app.schemas.auth import (
    SignupRequest, SignupResponse,
    LoginRequest, LoginResponse,
    UserResponse
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.auth_service import (
    create_user,
    authenticate_user,
    create_access_token,
    decode_access_token,
    get_user_by_id
)

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_conn=None
):
    # Extract token from "Bearer <token>"
    token = credentials.credentials
    user_id = decode_access_token(token)

    with get_db() as conn:
        user = get_user_by_id(conn, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        return user


@router.post("/signup", response_model=SignupResponse, status_code=201)
def signup(data: SignupRequest):
    with get_db() as conn:
        create_user(conn, data.email, data.password)
    return SignupResponse(message="Account created successfully")


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest):
    with get_db() as conn:
        user = authenticate_user(conn, data.email, data.password)
        token = create_access_token(str(user["id"]))
    return LoginResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user=Depends(get_current_user)):
    return current_user