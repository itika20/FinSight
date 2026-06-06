"""
Database Module - Handles PostgreSQL connection pooling and context management.
Provides safe database connection handling with automatic transaction management.
"""

import logging
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from app.core.config import settings
from app.core.constants import LOGGER_DATABASE

# Initialize logger for this module
logger = logging.getLogger(LOGGER_DATABASE)

def get_connection():
    """
    Creates a new PostgreSQL connection with RealDictCursor.
    
    Returns:
        psycopg2.extensions.connection: Database connection
        
    Note:
        - RealDictCursor: Rows are returned as dicts (e.g., row['email'])
        - Connection is NOT automatically closed — caller must manage lifecycle
        - For safe usage, use get_db() context manager instead
        
    Raises:
        psycopg2.Error: If connection fails (invalid credentials, DB unreachable)
    """
    logger.debug("Creating new database connection")
    try:
        conn = psycopg2.connect(
            settings.DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        logger.debug("Database connection established")
        return conn
    except psycopg2.Error as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

@contextmanager
def get_db():
    """
    Context manager for safe database connection handling.
    Automatically handles connection lifecycle and transaction management.
    
    Usage:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = %s", (id,))
            result = cursor.fetchone()
    
    Guarantees:
        1. Connection is created on entry
        2. Transaction is committed on successful exit
        3. Transaction is rolled back if any exception occurs
        4. Connection is always closed (even if error occurs)
        
    Raises:
        Re-raises any exception that occurs during the block execution
        
    Note:
        - Use this in EVERY endpoint and service function
        - Never manage connections manually — always use this context manager
        - Transaction is atomic: either all changes are saved or none are
    """
    conn = None
    try:
        logger.debug("Opening database connection context")
        conn = get_connection()
        yield conn
        
        # ── Commit on success ──
        logger.debug("Committing transaction")
        conn.commit()
        logger.debug("Transaction committed successfully")
        
    except Exception as e:
        # ── Rollback on error ──
        if conn:
            logger.warning(f"Rolling back transaction due to error: {type(e).__name__}")
            conn.rollback()
        logger.error(f"Database operation failed: {e}")
        raise
        
    finally:
        # ── Always close connection ──
        if conn:
            logger.debug("Closing database connection")
            conn.close()