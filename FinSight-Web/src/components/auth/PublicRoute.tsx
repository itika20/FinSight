import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

// PublicRoute is the opposite of ProtectedRoute
// If user is already logged in and tries to visit /login or /signup
// redirect them straight to /dashboard — no point showing login again
const PublicRoute = ({ children }: Props) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default PublicRoute