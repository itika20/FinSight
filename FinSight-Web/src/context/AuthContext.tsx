/**
 * AuthContext & AuthProvider - Application Authentication State Management
 *
 * This context provides centralized authentication for the entire app:
 * - User session persistence (localStorage token)
 * - Token validation on app load (via /auth/me endpoint)
 * - Automatic logout on token expiry (handled by axios interceptor)
 * - Automatic redirect to /login on 401 Unauthorized responses
 *
 * Architecture:
 * 1. App.tsx wraps entire app with <AuthProvider>
 * 2. Components use useAuth() hook to access auth state
 * 3. Context manages token lifecycle and session validation
 * 4. axios interceptor uses token for all API requests
 *
 * Session Lifecycle:
 * - App loads (user F5)
 * - AuthProvider checks localStorage for token
 * - If token exists, validates it via /auth/me
 * - If invalid/expired, clears storage and redirects to /login (via axios)
 * - If valid, loads user data and initializes app
 * - User can login/logout, context updates token and user
 * - Token stored persistently in localStorage (automatic on next load)
 *
 * Security Notes:
 * - Token stored in localStorage (accessible via JavaScript!)
 * - In production, consider httpOnly cookies instead
 * - Tokens expire after 24 hours (user must re-login)
 * - axios interceptor enforces re-authentication on 401
 */

import { createContext, useState, useEffect, type ReactNode } from 'react'
import type { User, AuthContextType } from '../models'
import { getMeApi } from '../api/auth'

const LOGGER_PREFIX = '[AuthContext]'

/**
 * React Context for Authentication State
 *
 * Stores:
 * - user: Currently authenticated user object (null if not logged in)
 * - token: JWT access token from backend (null if not logged in)
 * - isLoading: True while initializing session or during login/logout
 * - isAuthenticated: Derived boolean (token && user present)
 * - login(): Update token and user after successful authentication
 * - logout(): Clear token and user data
 *
 * Usage: Never import directly — use useAuth() hook instead
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  /** Entire app component tree (anything that might need auth state) */
  children: ReactNode
}

/**
 * Provider Component - Wraps entire app to enable useAuth() hook.
 *
 * Responsible for:
 * 1. Initializing session from localStorage on app load
 * 2. Validating stored token via /auth/me endpoint
 * 3. Exposing login() method to login components
 * 4. Exposing logout() method to any component
 * 5. Managing loading state during async operations
 *
 * Setup:
 * ```
 * // App.tsx
 * import { AuthProvider } from './context/AuthContext'
 * import { Router } from './Router'
 *
 * export function App() {
 *   return (
 *     <AuthProvider>
 *       <Router />
 *     </AuthProvider>
 *   )
 * }
 * ```
 *
 * Notes:
 * - Must wrap Router (or all components that use useAuth)
 * - Initializes synchronously on first render (isLoading=true initially)
 * - Automatically restores session from localStorage on page refresh
 * - All API requests automatically include JWT token via axios interceptor
 *
 * @param children - React component tree that will have access to auth context
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /** Currently authenticated user (null if not logged in) */
  const [user, setUser] = useState<User | null>(null)

  /** JWT token from backend (null if not logged in) */
  const [token, setToken] = useState<string | null>(null)

  /** True while checking localStorage or during login/logout operations */
  const [isLoading, setIsLoading] = useState<boolean>(true)

  /** Derived state: true only when both token and user data are present */
  const isAuthenticated = token !== null && user !== null

  // ============================================================================
  // SESSION INITIALIZATION — Run once on app mount
  // ============================================================================

  /**
   * Effect — Initialize session from localStorage on app load.
   *
   * This is what enables "stay logged in" functionality:
   * 1. User logs in via login form
   * 2. token is stored in localStorage by login() method
   * 3. User closes browser (or refreshes page)
   * 4. App reloads, AuthProvider mounted again
   * 5. This effect runs, checks localStorage, finds token
   * 6. Validates token via /auth/me call
   * 7. Restores user data and initializes app
   *
   * Edge Cases:
   * - No token in localStorage → skip validation, setIsLoading(false)
   * - Token expired → /auth/me returns 401, axios redirects to /login
   * - Token invalid → cleared from state and localStorage
   * - Network error during validation → user not loaded, can click "retry"
   *
   * Runs only once (empty dep array) on component mount.
   */
  useEffect(() => {
    const initializeAuth = async () => {
      console.log(`${LOGGER_PREFIX} Initializing session from localStorage...`)

      // Check if token exists in browser's local storage
      const storedToken = localStorage.getItem('token')

      if (storedToken) {
        try {
          console.log(`${LOGGER_PREFIX} Token found in localStorage, validating...`)

          // Set token immediately — axios interceptor needs it for /auth/me call
          setToken(storedToken)

          // Validate token by calling /auth/me endpoint
          // This endpoint requires Authorization: Bearer <token> header
          // If token is expired, backend returns 401
          // axios interceptor catches 401 and redirects to /login automatically
          const userData = await getMeApi()

          console.log(`${LOGGER_PREFIX} Session restored: user=${userData.id}`)
          setUser(userData)

        } catch (error) {
          // Token validation failed (expired, invalid, or network error)
          console.warn(`${LOGGER_PREFIX} Session validation failed, clearing storage`, error)

          // Clear invalid token from both state and localStorage
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)

          // App will show login page (caught by ProtectedRoute)
          // axios interceptor handles 401 redirect if needed
        }
      } else {
        console.log(`${LOGGER_PREFIX} No token in localStorage, user not logged in`)
      }

      // Initialization complete — allow UI to render (even if not logged in)
      setIsLoading(false)
    }

    // Call initialization function
    // Empty dependency array means this runs exactly once when component mounts
    initializeAuth()
  }, [])

  // ============================================================================
  // LOGIN & LOGOUT METHODS
  // ============================================================================

  /**
   * Login — Authenticate user and initialize session.
   *
   * Called by LoginPage after successful POST /auth/login:
   * 1. Backend returns JWT token
   * 2. LoginPage calls login(token)
   * 3. This saves token to localStorage and state
   * 4. Fetches user info via /auth/me
   * 5. Updates context state
   * 6. LoginPage redirects to /dashboard
   *
   * Flow:
   * ```
   * User fills login form
   * → LoginPage calls: await loginApi(email, password)
   * → Backend validates credentials, returns { access_token: "eyJ..." }
   * → LoginPage calls: await login(response.access_token)
   * → AuthProvider saves token and fetches user data
   * → LoginPage redirects to /dashboard
   * → useAuth() now returns { user, isAuthenticated: true }
   * ```
   *
   * @param newToken - JWT token from backend /auth/login endpoint
   * @throws Error if /auth/me call fails (network, server error)
   *
   * @example
   * const { login } = useAuth()
   * try {
   *   const response = await loginApi(email, password)
   *   await login(response.access_token)
   *   navigate('/dashboard')
   * } catch (err) {
   *   console.error('Login failed:', err.message)
   * }
   */
  const login = async (newToken: string): Promise<void> => {
    console.log(`${LOGGER_PREFIX} Logging in...`)

    // Store token immediately so axios interceptor can use it for /auth/me call
    // axios request interceptor reads from localStorage automatically
    localStorage.setItem('token', newToken)
    setToken(newToken)

    // Fetch user information using the new token
    // Authorization header added automatically by axios interceptor
    const userData = await getMeApi()

    console.log(`${LOGGER_PREFIX} Login successful: user=${userData.id}`)
    setUser(userData)
  }

  /**
   * Logout — Clear session and stored token.
   *
   * Called by:
   * - User clicks "Sign Out" button
   * - axios interceptor on 401 Unauthorized (automatic)
   * - Session validation fails on app load
   *
   * Actions:
   * 1. Remove token from localStorage
   * 2. Clear token and user from state
   * 3. useAuth() will return { user: null, isAuthenticated: false }
   * 4. ProtectedRoute redirects to /login
   *
   * @example
   * function UserMenu() {
   *   const { logout } = useAuth()
   *   return (
   *     <button onClick={() => {
   *       logout()
   *       navigate('/login')
   *     }}>
   *       Sign Out
   *     </button>
   *   )
   * }
   */
  const logout = (): void => {
    console.log(`${LOGGER_PREFIX} Logging out...`)

    // Remove persistent token
    localStorage.removeItem('token')

    // Clear session state
    setToken(null)
    setUser(null)

    console.log(`${LOGGER_PREFIX} Logout complete`)
  }

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  /**
   * Assemble context value with all state and methods.
   *
   * Every property here is accessible via useAuth() hook:
   * ```
   * const { user, token, isAuthenticated, isLoading, login, logout } = useAuth()
   * ```
   */
  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}