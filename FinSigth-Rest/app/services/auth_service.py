from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─────────────────────────────────────────────
# PASSWORD UTILITIES
# ─────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# ─────────────────────────────────────────────
# JWT UTILITIES
# ─────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(
            hours=settings.ACCESS_TOKEN_EXPIRE_HOURS
        )
    }
    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )

def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# ─────────────────────────────────────────────
# USER QUERIES — raw SQL
# ─────────────────────────────────────────────

def get_user_by_email(conn, email: str):
    """
    SELECT a single user by email.
    %s is a parameterised placeholder — psycopg2 handles escaping.
    Never use f-strings for SQL — that opens SQL injection vulnerabilities.
    """
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM users WHERE email = %s LIMIT 1",
            (email.lower(),)   # always pass params as a tuple
        )
        return cursor.fetchone()  # returns dict or None

def get_user_by_id(conn, user_id: str):
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM users WHERE id = %s LIMIT 1",
            (user_id,)
        )
        return cursor.fetchone()

def create_user(conn, email: str, password: str):
    """
    INSERT a new user row.
    RETURNING * gives us back the created row immediately —
    so we don't need a second SELECT to get the generated id and created_at.
    """
    # Check duplicate email first
    existing = get_user_by_email(conn, email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists"
        )

    hashed = hash_password(password)

    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING *
            """,
            (email.lower(), hashed)
        )
        return cursor.fetchone()  # returns the newly created user row

def authenticate_user(conn, email: str, password: str):
    """
    Verify email exists and password matches.
    Returns user row if valid, raises 401 if not.
    """
    user = get_user_by_email(conn, email)

    # Same error message for both cases — don't reveal which was wrong
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not verify_password(password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    return user