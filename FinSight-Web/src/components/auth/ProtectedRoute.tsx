/**
 * ProtectedRoute Component - Authorization Wrapper
 *
 * Guards private pages from unauthenticated access.
 * Used with React Router to conditionally render components.
 *
 * Behavior:
 * - While initializing from localStorage → Show loading spinner
 * - User authenticated (token + user data present) → Render children
 * - User not authenticated → Redirect to /login
 *
 * Prevents Flash on Page Refresh:
 * - Without isLoading check, user sees brief redirect to /login
 * - User has valid token in localStorage but state hasn't loaded yet
 * - isLoading prevents this flash by waiting for AuthContext to initialize
 *
 * Usage:
 * ```
 * // Router.tsx
 * <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 * <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
 * ```
 *
 * Note: Must be used inside AuthProvider and Router provider trees.
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { type ReactNode } from 'react'

interface ProtectedRouteProps {
  /** React component tree to render if user is authenticated */
  children: ReactNode
}

/**
 * Component - Conditionally render children or redirect to login.
 *
 * @param children - Page component to render if authorized
 * 
 * @returns
 *   - Loading spinner while checking localStorage authentication
 *   - Requested page if user is authenticated (isAuthenticated = true)
 *   - Redirect to /login if user is not authenticated
 *
 * @example
 * // Protect dashboard route
 * <Route 
 *   path="/dashboard" 
 *   element={
 *     <ProtectedRoute>
 *       <DashboardPage />
 *     </ProtectedRoute>
 *   } 
 * />
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  // Get authentication state from context
  const { isAuthenticated, isLoading } = useAuth()

  // ============================================================================
  // LOADING STATE — Initial session check
  // ============================================================================

  // While checking localStorage and validating token (initializing session)
  if (isLoading) {
    // Show loading state instead of flashing redirect
    // Important: Without this, authenticated users see brief redirect to /login
    // because isAuthenticated is false before token from localStorage loads
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  // ============================================================================
  // AUTHORIZATION CHECK
  // ============================================================================

  // Not authenticated → redirect to login page
  // 'replace' prevents browser back button from going back to protected page
  if (!isAuthenticated) {
    console.log('[ProtectedRoute] User not authenticated, redirecting to /login')
    return <Navigate to="/login" replace />
  }

  // ============================================================================
  // AUTHORIZED — RENDER
  // ============================================================================

  // User authenticated and session initialized → render requested page
  console.log('[ProtectedRoute] User authenticated, rendering protected content')
  return <>{children}</>
}

export default ProtectedRoute