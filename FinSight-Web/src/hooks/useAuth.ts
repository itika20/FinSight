/**
 * useAuth Hook - User Authentication State Management
 *
 * Provides convenient access to authentication context for components.
 * Automatically handles token validation, session management, and expiry.
 *
 * Architecture:
 * - AuthContext (provider) manages state at app root (App.tsx)
 * - useAuth hook exposes context to any component
 * - Hides implementation details (localStorage, localStorage, API calls)
 * - Enforces provider requirement at runtime (fails loudly if misused)
 *
 * Security:
 * - Token stored in localStorage by axios interceptor
 * - Session validated on app load via AuthContext
 * - Expired tokens trigger automatic logout (401 → redirect to /login)
 * - All API requests include token via axios interceptor
 *
 * Typical Usage:
 * ```
 * function LoginPage() {
 *   const { login, error, isLoading } = useAuth()
 *   return (
 *     <form onSubmit={(e) => {
 *       e.preventDefault()
 *       login(email, password)
 *     }}>
 *       ...
 *     </form>
 *   )
 * }
 * ```
 */

import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'
import { type AuthContextType } from '../models'

/**
 * Hook - Get authentication state and methods.
 *
 * Returns the entire AuthContext, which includes:
 *
 * **State Properties:**
 * - `user: User | null` - Currently logged-in user object (null if not authenticated)
 * - `isLoading: boolean` - True while validating token or during login/signup requests
 * - `error: string` - Error message from failures (empty if no error)
 * - `isAuthenticated: boolean` - True if user is logged in and token is valid
 *
 * **Action Methods:**
 * - `signup(email: string, password: string): Promise<void>` - Create new account
 * - `login(email: string, password: string): Promise<void>` - Authenticate and get token
 * - `logout(): void` - Clear token and user data
 * - `clearError(): void` - Clear error message from UI
 *
 * @returns AuthContextType - Full auth context (state + methods)
 *
 * @throws Error - If called outside AuthContext.Provider (developer mistake)
 *
 * @example
 * // Usage in a protected component
 * function Dashboard() {
 *   const { user, isAuthenticated, logout } = useAuth()
 *
 *   if (!isAuthenticated) return <Navigate to="/login" />
 *
 *   return (
 *     <div>
 *       <h1>Welcome, {user?.email}</h1>
 *       <button onClick={logout}>Sign Out</button>
 *     </div>
 *   )
 * }
 *
 * @example
 * // Usage in a login component
 * function LoginForm() {
 *   const [email, setEmail] = useState('')
 *   const [password, setPassword] = useState('')
 *   const { login, isLoading, error, clearError } = useAuth()
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault()
 *     try {
 *       await login(email, password)
 *       // Success! AuthContext redirects to /dashboard
 *     } catch (err) {
 *       // Error already in context, displayed via error prop
 *     }
 *   }
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       {error && (
 *         <div className="error">
 *           {error}
 *           <button onClick={clearError}>Dismiss</button>
 *         </div>
 *       )}
 *       <input value={email} onChange={(e) => setEmail(e.target.value)} />
 *       <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
 *       <button disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</button>
 *     </form>
 *   )
 * }
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)

  // Runtime validation: useAuth MUST be used within AuthContext.Provider
  // This catch is for developer mistakes (component outside provider)
  if (context === undefined) {
    throw new Error(
      'useAuth must be used within an AuthProvider. ' +
      'Ensure <AuthContext.Provider> wraps this component tree.'
    )
  }

  return context
}