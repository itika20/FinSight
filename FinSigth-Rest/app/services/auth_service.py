"""
Authentication Service - Handles password hashing, JWT token generation/validation, and user queries.
Provides secure authentication functions for the auth API endpoints.
"""

import logging
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.constants import (
    LOGGER_AUTH,
    ERROR_EMAIL_EXISTS,
    ERROR_INVALID_CREDENTIALS,
    LOG_USER_SIGNUP,
    LOG_USER_LOGIN,
    JWT_CLAIM_SUB,
    JWT_CLAIM_EXP
)

# Initialize logger for this module
logger = logging.getLogger(LOGGER_AUTH)

# Password hashing context using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─────────────────────────────────────────────
# PASSWORD UTILITIES
# ─────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """
    Hashes a plain password using bcrypt.
    Automatically generates a salt and uses a configurable work factor.
    
    Args:
        plain_password: Unhashed password string
        
    Returns:
        str: Bcrypt hash string (safe to store in database)
        
    Note:
        Uses deprecated="auto" to upgrade hash algorithm if bcrypt config changes.
    """
    logger.debug("Hashing password")
    return pwd_context.hash(plain_password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against a bcrypt hash.
    Constant-time comparison prevents timing attacks.
    
    Args:
        plain_password: User-provided password
        hashed_password: Bcrypt hash from database
        
    Returns:
        bool: True if password matches, False otherwise
    """
    result = pwd_context.verify(plain_password, hashed_password)
    logger.debug(f"Password verification: {'match' if result else 'mismatch'}")
    return result

# ─────────────────────────────────────────────
# JWT UTILITIES
# ─────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    """
    Generates a signed JWT access token for a user.
    Token includes user ID and expiration time.
    
    Args:
        user_id: UUID of the user
        
    Returns:
        str: Encoded JWT token (signed with SECRET_KEY)
        
    Note:
        - Token expires after ACCESS_TOKEN_EXPIRE_HOURS (default 24 hours)
        - Include "sub" claim for standard JWT compatibility
        - Uses HS256 algorithm (HMAC with SHA-256)
    """
    logger.info(f"Creating access token for user {user_id}")
    
    payload = {
        JWT_CLAIM_SUB: user_id,
        JWT_CLAIM_EXP: datetime.utcnow() + timedelta(
            hours=settings.ACCESS_TOKEN_EXPIRE_HOURS
        )
    }
    
    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    logger.debug(f"Token created, expires in {settings.ACCESS_TOKEN_EXPIRE_HOURS} hours")
    return token

def decode_access_token(token: str) -> str:
    """
    Validates and decodes a JWT access token.
    Verifies signature and checks expiration.
    
    Args:
        token: JWT token string (without "Bearer " prefix)
        
    Returns:
        str: User ID from the token's "sub" claim
        
    Raises:
        HTTPException: 401 if token is invalid, expired, or malformed
    """
    logger.debug("Validating access token")
    
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get(JWT_CLAIM_SUB)
        
        if not user_id:
            logger.warning("Token missing 'sub' claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        logger.debug(f"Token valid for user {user_id}")
        return user_id
        
    except JWTError as e:
        logger.warning(f"JWT validation failed: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# ─────────────────────────────────────────────
# USER QUERIES — raw SQL (parametric queries for security)
# ─────────────────────────────────────────────

def get_user_by_email(conn, email: str) -> dict | None:
    """
    Queries a user by email address (case-insensitive).
    
    Args:
        conn: Database connection
        email: Email address to search for
        
    Returns:
        dict: User row with id, email, password_hash, created_at
        None: If no user found
        
    Security:
        - Uses parametric query (%s) to prevent SQL injection
        - Email is lowercased for case-insensitive storage/lookup
    """
    logger.debug(f"Querying user by email: {email}")
    
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM users WHERE email = %s LIMIT 1",
            (email.lower(),)  # Always pass params as tuple
        )
        user = cursor.fetchone()  # Returns dict or None via RealDictCursor
    
    if not user:
        logger.debug(f"User not found for email: {email}")
    else:
        logger.debug(f"User found: {user['id']}")
    
    return user

def get_user_by_id(conn, user_id: str) -> dict | None:
    """
    Queries a user by UUID.
    
    Args:
        conn: Database connection
        user_id: UUID of user
        
    Returns:
        dict: User row with all fields
        None: If no user found
    """
    logger.debug(f"Querying user by ID: {user_id}")
    
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM users WHERE id = %s LIMIT 1",
            (user_id,)
        )
        user = cursor.fetchone()
    
    if not user:
        logger.debug(f"User not found for ID: {user_id}")
    else:
        logger.debug(f"User found: {user['email']}")
    
    return user

def create_user(conn, email: str, password: str) -> dict:
    """
    Creates a new user account.
    Hashes password and stores in database with UUID.
    
    Args:
        conn: Database connection
        email: User's email address (unique)
        password: Plain text password (will be hashed)
        
    Returns:
        dict: Created user row from database
        
    Raises:
        HTTPException: 409 if email already exists
        
    Process:
        1. Check if email is already registered
        2. Hash password using bcrypt
        3. INSERT new user (UUID auto-generated by DB)
        4. RETURNING * returns the created row immediately
    """
    logger.info(LOG_USER_SIGNUP.format(email=email))
    
    # ── Step 1: Check for duplicate email ──
    existing = get_user_by_email(conn, email)
    if existing:
        logger.warning(f"Signup attempt with existing email: {email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ERROR_EMAIL_EXISTS
        )

    # ── Step 2: Hash password ──
    hashed = hash_password(password)

    # ── Step 3: Insert new user ──
    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING *
            """,
            (email.lower(), hashed)
        )
        user = cursor.fetchone()  # Returns newly created user row
    
    logger.info(f"User created: {user['id']}")
    return user

def authenticate_user(conn, email: str, password: str) -> dict:
    """
    Authenticates a user by email and password.
    Verifies both existence and password correctness.
    
    Args:
        conn: Database connection
        email: User's email
        password: Plain text password to verify
        
    Returns:
        dict: Authenticated user row
        
    Raises:
        HTTPException: 401 if email not found or password wrong
        
    Security:
        - Uses same error message for both failures (doesn't reveal which failed)
        - Prevents user enumeration attacks
        - Password verification is constant-time via bcrypt
    """
    logger.info(LOG_USER_LOGIN.format(email=email))
    
    # ── Step 1: Look up user ──
    user = get_user_by_email(conn, email)
    
    # ── Step 2: Check existence and verify password ──
    # Use identical error message for both failures — security best practice
    if not user:
        logger.warning(f"Login attempt for non-existent user: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_CREDENTIALS
        )

    if not verify_password(password, user["password_hash"]):
        logger.warning(f"Login attempt with wrong password for user: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_CREDENTIALS
        )

    logger.info(f"Login successful: {user['id']}")
    return user