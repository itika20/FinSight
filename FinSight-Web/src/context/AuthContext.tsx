import { createContext, useState, useEffect, type ReactNode } from 'react'
import type { User, AuthContextType } from '../models'
import { getMeApi } from '../api/auth'

// Step 1 — Create the context with undefined as default
// We check for undefined in useAuth hook to catch usage outside provider
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Step 2 — This is the Provider component
// It wraps your entire app and makes auth state available everywhere
// ReactNode means it accepts any React children — your whole app tree
interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // The three core pieces of state this context manages
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  // isLoading starts TRUE — we don't know auth state until we check localStorage

  // Step 3 — On first app load, check if a token already exists in localStorage
  // This is what keeps users logged in after page refresh
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token')

      if (storedToken) {
        try {
          // Token exists — validate it by calling /auth/me
          // If token is expired, this will throw a 401
          // The axios interceptor will catch that and redirect to /login
          setToken(storedToken)
          const userData = await getMeApi()
          setUser(userData)
        } catch {
          // Token is invalid or expired — clean up
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        }
      }
      // Whether or not token existed, we're done initializing
      setIsLoading(false)
    }

    initializeAuth()
  }, []) // empty array — runs only once when app first mounts

  // Step 4 — login() is called by LoginPage after successful API call
  // It receives the token, stores it, then fetches user info
  const login = async (newToken: string): Promise<void> => {
    // Save to localStorage first — so axios interceptor can use it immediately
    localStorage.setItem('token', newToken)
    setToken(newToken)

    // Now fetch the user's info using the new token
    // getMeApi() will automatically use the token via axios interceptor
    const userData = await getMeApi()
    setUser(userData)
  }

  // Step 5 — logout() clears everything
  const logout = (): void => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  // Step 6 — isAuthenticated is derived state
  // True only when we have BOTH a token AND user info
  const isAuthenticated = token !== null && user !== null

  // Step 7 — Everything gets passed to the context value
  // Any component that calls useAuth() gets all of these
  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}