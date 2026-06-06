/**
 * PublicRoute Component - Guest-Only Route Wrapper
 *
 * Complements ProtectedRoute: redirects already-logged-in users away
 * from auth pages (login, signup).
 *
 * Behavior:
 * - While initializing from localStorage → Show loading spinner
 * - User not authenticated → Render children (login/signup page)
 * - User authenticated → Redirect to /dashboard (already logged in!)
 *
 * Use Case:
 * - LoginPage should only show users without accounts
 * - SignupPage should only show unauthenticated users
 * - If logged-in user tries /login, redirect to dashboard
 *
 * Usage:
 * ```
 * // Router.tsx
 * <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
 * <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
 * ```
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { type ReactNode } from 'react'

interface PublicRouteProps {
  /** React component tree to render if user is NOT authenticated */
  children: ReactNode
}

/**
 * Component - Conditionally render children or redirect authenticated users.
 *
 * @param children - Auth page component (login, signup) to render if not authenticated
 *
 * @returns
 *   - Loading spinner while checking localStorage authentication
 *   - Requested page if user is NOT authenticated
 *   - Redirect to /dashboard if user is already authenticated
 *
 * @example
 * // Show login form to unauthenticated users only
 * <Route 
 *   path="/login" 
 *   element={
 *     <PublicRoute>
 *       <LoginPage />
 *     </PublicRoute>
 *   } 
 * />
 */
const PublicRoute = ({ children }: PublicRouteProps) => {
  // Get authentication state from context
  const { isAuthenticated, isLoading } = useAuth()

  // ============================================================================
  // LOADING STATE — Initial session check
  // ============================================================================

  // While checking localStorage and validating token (initializing session)
  if (isLoading) {
    // Show loading state to prevent flashing
    // Unauthenticated users won't see this long (quick initialize)
    // Authenticated users redirected to dashboard after load completes
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  // ============================================================================
  // AUTHORIZATION CHECK — Already logged in?
  // ============================================================================

  // User already authenticated → no need to show login!
  // Send them to their dashboard
  // 'replace' prevents browser back button from going back to login page
  if (isAuthenticated) {
    console.log('[PublicRoute] User already authenticated, redirecting to /dashboard')
    return <Navigate to="/dashboard" replace />
  }

  // ============================================================================
  // NOT AUTHENTICATED — RENDER
  // ============================================================================

  // User not logged in → show login/signup page
  console.log('[PublicRoute] User not authenticated, rendering public auth page')
  return <>{children}</>
}

export default PublicRoute