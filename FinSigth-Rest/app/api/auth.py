"""
Authentication API Routes - Handles signup, login, and user profile endpoints.
Provides JWT-based stateless authentication for the FinSight API.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.database import get_db
from app.core.constants import (
    LOGGER_GENERAL,
    ERROR_TRANSACTION_NOT_FOUND
)
from app.schemas.auth import (
    SignupRequest, SignupResponse,
    LoginRequest, LoginResponse,
    UserResponse
)
from app.services.auth_service import (
    create_user,
    authenticate_user,
    create_access_token,
    decode_access_token,
    get_user_by_id
)

# Initialize logger for this module
logger = logging.getLogger(LOGGER_GENERAL)

# FastAPI security scheme for Bearer token authentication
security = HTTPBearer()

router = APIRouter(prefix="/auth", tags=["auth"])

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_conn=None
) -> dict:
    """
    FastAPI dependency for route protection.
    Extracts and validates JWT token, then returns the authenticated user.
    
    Args:
        credentials: Bearer token from Authorization header (auto-extracted by HTTPBearer)
        db_conn: Unused (kept for documentation clarity)
        
    Returns:
        dict: User row from database with all fields
        
    Raises:
        HTTPException: 403 if token missing or invalid
        HTTPException: 401 if user not found (token references deleted user)
        
    Usage:
        @router.get("/me")
        def get_profile(current_user=Depends(get_current_user)):
            return current_user  # User is already authenticated
    
    Flow:
        1. Extract token from "Bearer <token>" header
        2. Validate token signature and expiration
        3. Extract user_id from token
        4. Query user from database (ensures user still exists)
        5. Return user object or raise 401
    """
    logger.debug("Validating current user from token")
    
    # HTTPBearer automatically returns 403 if header is missing
    # Extract the token string (authorization header value)
    token = credentials.credentials

    # Decode and validate JWT — raises 401 if invalid/expired
    user_id = decode_access_token(token)

    # Query user from database — ensures user exists and hasn't been deleted
    with get_db() as conn:
        user = get_user_by_id(conn, user_id)
        if not user:
            logger.warning(f"Token references deleted user: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
    logger.debug(f"Authenticated user: {user['id']}")
    return user


@router.post("/signup", response_model=SignupResponse, status_code=201)
def signup(data: SignupRequest):
    """
    User signup endpoint — creates a new account.
    
    Args:
        data: SignupRequest with email and password
        
    Returns:
        SignupResponse: Success message
        
    Status Codes:
        201: Account created successfully
        400: Validation failed (invalid email/password format)
        409: Email already registered
        500: Database error
        
    Security:
        - Password is hashed using bcrypt before storage
        - Email is lowercased for case-insensitive lookups
        - No sensitive data in response
    """
    logger.info(f"Signup request: {data.email}")
    
    try:
        with get_db() as conn:
            create_user(conn, data.email, data.password)
        
        logger.info(f"Signup successful: {data.email}")
        return SignupResponse(message="Account created successfully")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Signup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account"
        )


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest):
    """
    User login endpoint — authenticates user and returns JWT token.
    
    Args:
        data: LoginRequest with email and password
        
    Returns:
        LoginResponse: JWT access token
        
    Status Codes:
        200: Login successful, token returned
        401: Invalid credentials (email not found or password wrong)
        500: Database error
        
    Token Details:
        - Format: JWT (JSON Web Token)
        - Algorithm: HS256 (HMAC with SHA-256)
        - Expiry: 24 hours (configurable via settings)
        - Include: User ID, expiration timestamp
        
    Frontend Usage:
        1. Save token to localStorage
        2. Include in Authorization header: "Bearer <token>"
        3. Axios interceptor can automate this
    """
    logger.info(f"Login request: {data.email}")
    
    try:
        with get_db() as conn:
            # Authenticate user — raises 401 if invalid
            user = authenticate_user(conn, data.email, data.password)
            
            # Generate JWT token — expires in 24 hours
            token = create_access_token(str(user["id"]))
        
        logger.info(f"Login successful: {user['id']}")
        return LoginResponse(access_token=token)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Login failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.get("/me", response_model=UserResponse)
def get_me(current_user=Depends(get_current_user)):
    """
    Get current user's profile — requires authentication.
    
    Returns:
        UserResponse: Current user's information
        
    Status Codes:
        200: User info returned
        401: Invalid or missing token
        
    Usage:
        Called by frontend on app load to validate token
        and restore user session after page refresh.
        
    Example Response:
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "user@example.com",
            "created_at": "2026-04-01T10:30:00"
        }
    """
    logger.debug(f"Fetching user profile: {current_user['id']}")
    return current_user