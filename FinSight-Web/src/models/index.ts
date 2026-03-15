export interface User {
  id: string
  email: string
  created_at: string
}

export interface AuthContextType {
  user: User | null        // null means not logged in
  token: string | null     // null means no token exists
  isAuthenticated: boolean // derived from token — cleaner to check than token !== null
  isLoading: boolean       // true while we're validating token on first load
  login: (token: string) => Promise<void>  // takes token, fetches user, sets state
  logout: () => void       // clears everything
}