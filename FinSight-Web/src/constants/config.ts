/**
 * Constants for the FinSight Frontend Application.
 * Centralized configuration for API endpoints, error messages, validation, and business logic.
 */

// ─────────────────────────────────────────────
// API CONFIGURATION
// ─────────────────────────────────────────────

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  TIMEOUT_MS: 30000, // 30 second timeout for requests
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
} as const

// ─────────────────────────────────────────────
// GOALS CONSTANTS
// ─────────────────────────────────────────────

export const GOALS_ENDPOINT = '/goals'

export const GOAL_PRESETS = [
  { label: 'Emergency Fund', amount: 150000, months: 6 },
  { label: 'Europe Trip',    amount: 200000, months: 12 },
  { label: 'New Laptop',     amount: 80000,  months: 4 },
  { label: 'Down Payment',   amount: 500000, months: 24 },
] as const

// Status badge display labels (on_track / at_risk / off_track → display string)
export const GOAL_STATUS_LABELS: Record<string, string> = {
  on_track:  'On track',
  at_risk:   'Behind',
  off_track: 'Behind',
}

// Status badge Tailwind classes
export const GOAL_STATUS_BADGE: Record<string, string> = {
  on_track:  'bg-green-100 text-green-800 border border-green-200',
  at_risk:   'bg-amber-100 text-amber-800 border border-amber-200',
  off_track: 'bg-red-100   text-red-800   border border-red-200',
}

// CreateGoalModal configuration
export const GOAL_MODAL = {
  VISIBLE_CARDS: 5,   // recommendation cards shown before "Show more"
  MAX_MONTHS:    60,  // slider max (5 years)
  MIN_MONTHS:    1,
} as const

// ─────────────────────────────────────────────
// AUTHENTICATION CONSTANTS
// ─────────────────────────────────────────────

export const AUTH_STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user'
} as const

export const AUTH_ENDPOINTS = {
  SIGNUP: '/auth/signup',
  LOGIN: '/auth/login',
  ME: '/auth/me',
  LOGOUT: '/auth/logout'
} as const

// Token expiry and validation
export const TOKEN_CONFIG = {
  TYPE: 'bearer',
  EXPIRY_HOURS: 24,
  REFRESH_THRESHOLD_MS: 5 * 60 * 1000 // Refresh 5 minutes before expiry
} as const

// ─────────────────────────────────────────────
// UPLOAD & TRANSACTION CONSTANTS
// ─────────────────────────────────────────────

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  ACCEPTED_FILE_TYPES: ['application/pdf'],
  ACCEPTED_FILE_EXTENSIONS: ['.pdf']
} as const

export const UPLOAD_ENDPOINTS = {
  STATEMENT: '/upload/statement',
  TRANSACTIONS: '/upload/transactions',
  UPDATE_CATEGORY: '/upload/transactions/{id}/category'
} as const

// Upload progress states
export const UPLOAD_STATES = {
  IDLE: 'idle',
  SELECTED: 'selected',
  UPLOADING: 'uploading',
  PARSING: 'parsing',
  SUCCESS: 'success',
  ERROR: 'error'
} as const

// ─────────────────────────────────────────────
// ERROR MESSAGES
// ─────────────────────────────────────────────

export const ERROR_MESSAGES = {
  // File validation errors
  FILE_REQUIRED: 'Please select a file to upload',
  FILE_TOO_LARGE: 'File too large. Maximum size is 10MB.',
  INVALID_FILE_FORMAT: 'Only PDF files are supported.',
  
  // Upload errors
  UPLOAD_FAILED_400: 'Invalid file. Please check the format and try again.',
  UPLOAD_FAILED_413: 'File too large. Maximum size is 10MB.',
  UPLOAD_FAILED_422: 'Could not parse this file. Make sure it is a valid bank statement.',
  UPLOAD_FAILED_500: 'Something went wrong. Please try again.',
  UPLOAD_CANCELLED: 'Upload was cancelled.',
  
  // Authentication errors
  LOGIN_REQUIRED: 'Please log in to access this page.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  
  // Network errors
  NETWORK_ERROR: 'Network error. Please check your connection.',
  REQUEST_TIMEOUT: 'Request timed out. Please try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  
  // Generic errors
  GENERIC_ERROR: 'Something went wrong. Please try again.',
  PAGE_NOT_FOUND: 'Page not found.',
  
  // Form validation errors
  EMAIL_REQUIRED: 'Email is required.',
  EMAIL_INVALID: 'Please enter a valid email address.',
  PASSWORD_REQUIRED: 'Password is required.',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters long.',
  PASSWORDS_DONT_MATCH: 'Passwords do not match.',
  CATEGORY_INVALID: 'Please select a valid category.'
} as const

// ─────────────────────────────────────────────
// SUCCESS MESSAGES
// ─────────────────────────────────────────────

export const SUCCESS_MESSAGES = {
  ACCOUNT_CREATED: 'Account created successfully! You can now log in.',
  LOGIN_SUCCESS: 'Logged in successfully!',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  UPLOAD_SUCCESS: 'Statement uploaded and analyzed successfully.',
  CATEGORY_UPDATED: 'Category updated successfully.',
  TRANSACTION_FETCHED: 'Transactions fetched successfully.'
} as const

// ─────────────────────────────────────────────
// TRANSACTION CATEGORIES
// ─────────────────────────────────────────────

export const TRANSACTION_CATEGORIES = [
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
] as const

export const CATEGORY_COLORS: Record<typeof TRANSACTION_CATEGORIES[number], string> = {
  'Food': '#FF6B6B',
  'Groceries': '#4ECDC4',
  'Transport': '#45B7D1',
  'Shopping': '#FFA07A',
  'Entertainment': '#98D8C8',
  'Healthcare': '#F7DC6F',
  'Utilities': '#BB8FCE',
  'EMI & Loans': '#85C1E2',
  'Investments': '#52B788',
  'Transfers': '#A8DADC',
  'Fuel': '#F4A261',
  'Education': '#457B9D',
  'Insurance': '#E76F51',
  'Other': '#D3D3D3',
  'Uncategorised': '#8B8B8B'
} as const

// ─────────────────────────────────────────────
// TRANSACTION TYPES
// ─────────────────────────────────────────────

export const TRANSACTION_TYPES = {
  DEBIT: 'debit',
  CREDIT: 'credit'
} as const

// ─────────────────────────────────────────────
// VALIDATION RULES
// ─────────────────────────────────────────────

export const VALIDATION_RULES = {
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    MIN_LENGTH: 5,
    MAX_LENGTH: 255
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL_CHAR: false
  },
  TRANSACTION_DESCRIPTION: {
    MAX_LENGTH: 255
  }
} as const

// ─────────────────────────────────────────────
// UI/UX CONSTANTS
// ─────────────────────────────────────────────

export const UI_CONFIG = {
  // Loading indicators
  SKELETON_COUNT: 5, // Number of skeleton loaders to show while loading
  DEBOUNCE_DELAY_MS: 300, // Debounce for search/filter inputs
  ANIMATION_DURATION_MS: 300, // CSS animation duration
  
  // Toast/Notification
  TOAST_DURATION_MS: 5000, // Auto-dismiss after 5 seconds
  TOAST_POSITION: 'bottom-right',
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  
  // Forms
  INPUT_FOCUS_DELAY_MS: 100
} as const

// ─────────────────────────────────────────────
// HTTP STATUS CODES
// ─────────────────────────────────────────────

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  REQUEST_ENTITY_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────

export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
} as const

// Enable logging in development only
export const LOGGER_CONFIG = {
  ENABLED: import.meta.env.DEV,
  LEVEL: import.meta.env.DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR,
  PREFIX: '[FinSight]'
} as const
