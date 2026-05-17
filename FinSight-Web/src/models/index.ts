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

export interface Transaction {
  transaction_id: string
  date: string             // YYYY-MM-DD
  description: string
  amount: number           // positive for credit, negative for debit
  type: 'credit' | 'debit'
  balance: number | null
  category?: string | null
  confidence?: string | null  // 'high' | 'medium' | 'low' | 'uncategorised' | 'user_confirmed'
}

export interface DateRange {
  from: string | null      // YYYY-MM-DD
  to: string | null        // YYYY-MM-DD
}

export interface TransactionContextType {
  transactions: Transaction[]
  totalCount: number
  totalSpend: number
  topCategory: string | null
  avgMonthlySavings: number   // monthly average of Investments-category debits across all months
  dateRange: DateRange
  isLoading: boolean
  error: string | null
  loadTransactions: () => Promise<void>
  addTransactions: (newTransactions: Transaction[]) => void
  updateTransactionCategory: (transactionId: string, category: string) => Promise<void>
  clearError: () => void
}