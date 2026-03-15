import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

const ProtectedRoute = ({ children }: Props) => {
  const { isAuthenticated, isLoading } = useAuth()

  // Still checking localStorage on first load — show nothing yet
  // Without this, there's a flash where it redirects to /login
  // even for authenticated users, because state hasn't loaded yet
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  // Not authenticated — send to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Authenticated — render the actual page
  return <>{children}</>
}

export default ProtectedRoute