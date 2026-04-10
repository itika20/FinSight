/**
 * Axios HTTP Client - Configured for FinSight API communication.
 * Handles request/response interception for automatic JWT token management.
 * 
 * Features:
 * - Automatic token injection in Authorization header
 * - Automatic logout on token expiration (401 response)
 * - Base URL configuration from environment
 * - JSON content-type handling
 */

import axios from 'axios'
import { API_CONFIG, AUTH_STORAGE_KEYS, TOKEN_CONFIG, HTTP_STATUS } from '../constants/config'

/**
 * Create axios instance with global configuration.
 * 
 * Config:
 * - baseURL: API server URL (from VITE_API_BASE_URL env var)
 * - Content-Type: application/json (for API communication)
 * - Timeout: 30 seconds (configurable)
 */
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * Request Interceptor
 * Runs automatically BEFORE every API call.
 * 
 * Responsibility: Inject JWT token into Authorization header
 * So backend knows who is making the request.
 * 
 * Flow:
 * 1. Read token from localStorage
 * 2. If token exists, add to Authorization header
 * 3. Format: "Bearer <token>"
 * 4. Pass request to backend
 */
api.interceptors.request.use(
  (config) => {
    // Read stored JWT token
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)

    // Attach token to every request if it exists
    if (token) {
      config.headers.Authorization = `${TOKEN_CONFIG.TYPE} ${token}`
      logger.debug(`[Axios] Added token to Authorization header`)
    }

    return config
  },
  (error) => {
    logger.error(`[Axios] Request error: ${error.message}`)
    return Promise.reject(error)
  }
)

/**
 * Response Interceptor
 * Runs automatically AFTER every API response comes back.
 * 
 * Responsibility: Handle authentication failures
 * If token is invalid/expired (401), force logout.
 * 
 * Flow:
 * 1. If response succeeds (2xx status), pass it through
 * 2. If response is 401 (unauthorized):
 *    - Token is invalid or expired
 *    - Clear all auth data from localStorage
 *    - Redirect to /login page
 *    - Force user to re-authenticate
 * 3. For other errors, pass to caller for handling
 */
api.interceptors.response.use(
  (response) => {
    logger.debug(`[Axios] Response OK: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    const status = error.response?.status
    const url = error.config?.url

    if (status === HTTP_STATUS.UNAUTHORIZED) {
      // Token is invalid or expired
      logger.warn('[Axios] Received 401 Unauthorized - clearing auth and redirecting to login')
      
      // Clear all auth data
      localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN)
      localStorage.removeItem(AUTH_STORAGE_KEYS.USER)
      
      // Redirect to login page
      // This forces re-authentication when token expires
      window.location.href = '/login'
    } else {
      logger.error(`[Axios] Response error: ${status} ${url} - ${error.message}`)
    }

    return Promise.reject(error)
  }
)

/**
 * Simple logger utility for debugging HTTP requests/responses.
 * Only logs in development mode.
 */
const logger = {
  debug: (msg: string) => {
    if (import.meta.env.DEV) console.log(`🔵 ${msg}`)
  },
  warn: (msg: string) => {
    if (import.meta.env.DEV) console.warn(`🟡 ${msg}`)
  },
  error: (msg: string) => {
    console.error(`🔴 ${msg}`)
  }
}

export default api