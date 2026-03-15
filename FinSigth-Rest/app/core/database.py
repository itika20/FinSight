import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from app.core.config import settings

def get_connection():
    """
    Creates a new PostgreSQL connection.
    psycopg2.extras.RealDictCursor makes rows return as dicts
    instead of tuples — so you can do row['email'] instead of row[0]
    """
    return psycopg2.connect(
        settings.DATABASE_URL,
        cursor_factory=psycopg2.extras.RealDictCursor
    )

@contextmanager
def get_db():
    """
    Context manager for database connections.
    Use this in every route and service with: with get_db() as db:
    
    Guarantees:
    - Connection is always closed after use (even if error occurs)
    - Transaction is committed on success
    - Transaction is rolled back on error
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()      # save changes if everything went fine
    except Exception:
        conn.rollback()    # undo changes if anything went wrong
        raise
    finally:
        conn.close()       # always close connection