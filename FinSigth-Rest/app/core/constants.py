"""
Constants for the FinSight application.
Centralized configuration for magic numbers, strings, and business logic constants.
"""

# ─────────────────────────────────────────────
# FILE UPLOAD CONSTANTS
# ─────────────────────────────────────────────

# Maximum file size: 10MB
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

# Supported MIME types for uploads
VALID_PDF_MIMES = {'application/pdf'}

# File type identifier
SUPPORTED_FILE_TYPE = 'pdf'

# ─────────────────────────────────────────────
# TRANSACTION CATEGORY CONSTANTS
# ─────────────────────────────────────────────

# Valid expense categories for user transactions
VALID_TRANSACTION_CATEGORIES = {
    'Food',
    'Groceries',
    'Transport',
    'Shopping',
    'Entertainment',
    'Healthcare',
    'Utilities',
    'EMI & Loans',
    'Investments',
    'Transfers',
    'Fuel',
    'Education',
    'Insurance',
    'Other',
    'Uncategorised'
}

# Default category when transaction cannot be categorized
DEFAULT_CATEGORY = 'Uncategorised'

# ─────────────────────────────────────────────
# DATABASE STATUS CONSTANTS
# ─────────────────────────────────────────────

# Upload status enum values
UPLOAD_STATUS_PROCESSING = 'processing'
UPLOAD_STATUS_COMPLETED = 'completed'
UPLOAD_STATUS_FAILED = 'failed'

# Transaction type enum values
TRANSACTION_TYPE_DEBIT = 'debit'
TRANSACTION_TYPE_CREDIT = 'credit'

# Confidence level for categorization
CONFIDENCE_AUTO = 'auto'
CONFIDENCE_USER_CONFIRMED = 'user_confirmed'

# ─────────────────────────────────────────────
# PDF PARSING CONSTANTS
# ─────────────────────────────────────────────

# Date formats to try when parsing transactions
DATE_FORMATS = [
    '%d/%m/%Y',      # 15/03/2026
    '%m/%d/%Y',      # 03/15/2026
    '%Y-%m-%d',      # 2026-03-15
    '%d-%m-%Y',      # 15-03-2026
    '%d %b %Y',      # 15 Mar 2026
    '%d-%b-%Y',      # 15-Mar-2026
    '%d/%m/%y',      # 15/03/26
    '%m/%d/%y',      # 03/15/26
]

# Pages to group together for LLM processing
PAGES_PER_CHUNK = 3

# ─────────────────────────────────────────────
# ERROR MESSAGE CONSTANTS
# ─────────────────────────────────────────────

ERROR_FILE_TOO_LARGE = "File too large. Maximum size is 10MB."
ERROR_INVALID_FILE_FORMAT = "Only PDF files are supported."
ERROR_PARSE_FAILED = "Could not parse this file. Make sure it is a valid bank statement."
ERROR_STORAGE_FAILED = "Failed to store transactions. Please try again."
ERROR_EMAIL_EXISTS = "An account with this email already exists."
ERROR_INVALID_CREDENTIALS = "Invalid email or password."
ERROR_TRANSACTION_NOT_FOUND = "Transaction not found."
ERROR_INVALID_CATEGORY = "Invalid category. Must be one of: {valid_categories}"

# ─────────────────────────────────────────────
# GOAL SERVICE CONSTANTS
# ─────────────────────────────────────────────

# Minimum months of transaction history to compute a reliable profile
GOAL_MIN_MONTHS_DATA = 2

# Minimum percentage-point gap to flag a category as overspending
GOAL_OVERSPEND_THRESHOLD = 0.02

# Minimum single credit transaction to count toward income estimate
INCOME_MIN_CREDIT_AMOUNT = 5000.0

# DB category name → model feature name (categories not listed here
# are tracked in spending but not individually modelled)
CATEGORY_FEATURE_MAP = {
    'Food':          'food',
    'Groceries':     'groceries',
    'Transport':     'transport',
    'Shopping':      'shopping',
    'Entertainment': 'entertainment',
    'Utilities':     'utilities',
    'Healthcare':    'healthcare',
    'Investments':   'investments',
    'Fuel':          'fuel',
}

# Categories that must never appear as cutback recommendations.
#   Investments  — they ARE savings; recommending cuts contradicts the goal
#   EMI & Loans  — fixed legal obligations; user cannot reduce them
#   Healthcare   — non-discretionary; cutting is harmful
NON_CUTTABLE_CATEGORIES: frozenset = frozenset({"Investments", "EMI & Loans", "Healthcare"})

# Minimum percentage-point gap below peer benchmark before surfacing the
# "you under-invest compared to peers" insight (avoids noise for tiny gaps)
INVESTMENT_INSIGHT_THRESHOLD: float = 0.02

# Order in which to allocate cuts (less painful / most discretionary first)
GOAL_CUT_PRIORITY = [
    'entertainment',
    'shopping',
    'food',
    'transport',
    'fuel',
    'groceries',
    'utilities',
    'healthcare',
    'investments',   # last — cutting investments harms long-term wealth
]

# Error messages
ERROR_INSUFFICIENT_HISTORY = (
    "Need at least {min_months} months of transaction data to compute your spending profile."
)
ERROR_INCOME_UNKNOWN = (
    "Cannot estimate income: no credit transactions above Rs{threshold:,.0f}."
)
ERROR_GOAL_ALREADY_MET = "You are already saving enough to reach this goal — no cutbacks needed."

# ─────────────────────────────────────────────
# LOGGING CONSTANTS
# ─────────────────────────────────────────────

# Logger names
LOGGER_AUTH = 'auth'
LOGGER_UPLOAD = 'upload'
LOGGER_PARSING = 'parsing'
LOGGER_DATABASE = 'database'
LOGGER_GENERAL = 'finsight'
LOGGER_GOALS = 'goals'

# Log message templates
LOG_USER_SIGNUP = "User signup: {email}"
LOG_USER_LOGIN = "User login: {email}"
LOG_USER_LOGOUT = "User logout: {user_id}"
LOG_FILE_UPLOAD_START = "File upload started: {filename}, size: {file_size} bytes"
LOG_TRANSACTIONS_STORED = "Stored {count} transactions for user {user_id}"
LOG_PARSING_START = "Starting PDF parsing: {filename}"
LOG_PARSING_COMPLETE = "PDF parsing complete: {count} transactions extracted"

# ─────────────────────────────────────────────
# PAGINATION & LIMITS
# ─────────────────────────────────────────────

# Default page size for transaction listing
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

# ─────────────────────────────────────────────
# JWT CONSTANTS
# ─────────────────────────────────────────────

# Token type for authorization header
TOKEN_TYPE_BEARER = 'bearer'

# JWT claim names
JWT_CLAIM_SUB = 'sub'
JWT_CLAIM_EXP = 'exp'
