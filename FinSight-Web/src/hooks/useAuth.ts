import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'
import { type AuthContextType } from '../models'

// This hook is a shortcut so components don't import AuthContext directly
// Instead of: const context = useContext(AuthContext)
// They just do: const { user, login, logout } = useAuth()
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)

  // If context is undefined, useAuth was called outside of AuthProvider
  // This is a developer mistake — fail loudly so it's caught immediately
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}