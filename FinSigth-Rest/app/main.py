"""
FinSight API - Main Application Entry Point.
FastAPI server for personal finance analysis with JWT authentication and PDF parsing.
"""

import logging
import logging.handlers

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.upload import router as upload_router
from app.core.constants import LOGGER_GENERAL, LOGGER_AUTH, LOGGER_UPLOAD, LOGGER_PARSING, LOGGER_DATABASE

# ─────────────────────────────────────────────
# CONFIGURE LOGGING
# ─────────────────────────────────────────────

def configure_logging():
    """
    Configure logging for all modules.
    Sets up console output with proper formatting and log levels.
    Handlers are added only to root logger; child loggers propagate to root.
    """
    # Log format: [TIMESTAMP] [LEVEL] [LOGGER_NAME] Message
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    formatter = logging.Formatter(log_format, datefmt='%Y-%m-%d %H:%M:%S')
    
    # Console handler for all output
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    
    # Configure root logger only (child loggers will propagate to this)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    
    # Remove any existing handlers to avoid duplicates on reload
    root_logger.handlers.clear()
    
    # Add console handler to root logger
    root_logger.addHandler(console_handler)
    
    # Set child loggers to DEBUG level (they inherit handlers from root)
    for logger_name in [LOGGER_GENERAL, LOGGER_AUTH, LOGGER_UPLOAD, LOGGER_PARSING, LOGGER_DATABASE]:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.DEBUG)
    
    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("psycopg2").setLevel(logging.WARNING)
    logging.getLogger("pdfminer").setLevel(logging.WARNING)
    logging.getLogger("pypdf").setLevel(logging.WARNING)
    logging.getLogger("python_multipart").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

# Initialize logging before creating logger
configure_logging()

# Initialize logger
logger = logging.getLogger(LOGGER_GENERAL)

# Create FastAPI app instance
app = FastAPI(
    title="FinSight API",
    version="1.0.0",
    description="Personal finance analyzer with AI-powered PDF parsing"
)

# Configure CORS (Cross-Origin Resource Sharing)
# Allows frontend (running on different port) to make requests to backend
cors_origins = [
    "http://localhost:5173",  # Vite dev server (frontend)
]

if True:  # Only enable in dev
    logger.info(f"CORS enabled for origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,  # Allow cookies/auth headers
    allow_methods=["*"],     # Allow all HTTP methods
    allow_headers=["*"],     # Allow all headers
)

# Include routers
logger.info("Registering API routers")
app.include_router(auth_router)
app.include_router(upload_router)

@app.get("/health", tags=["System"])
def health():
    """
    Health check endpoint — confirms API is running.
    
    Returns:
        dict: Status message
        
    Usage:
        Called by frontend to verify backend connectivity.
        Called by load balancers to check server health.
    """
    logger.debug("Health check request")
    return {"status": "ok", "message": "FinSight API is running"}

@app.on_event("startup")
async def startup():
    """Initialize logging and startup tasks."""
    logger.info("FinSight API starting up")

@app.on_event("shutdown")
async def shutdown():
    """Cleanup and shutdown tasks."""
    logger.info("FinSight API shutting down")