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

export interface Upload {
  id: string
  filename: string
  file_type: string
  transaction_count: number
  status: string
  created_at: string
}

export interface UploadListResponse {
  uploads: Upload[]
  total_count: number
}

export interface DeleteUploadResponse {
  message: string
  deleted_transaction_count: number
}

export interface TransactionContextType {
  transactions: Transaction[]           // full unfiltered list
  filteredTransactions: Transaction[]   // filtered by selectedMonth (or all if null)
  totalCount: number                    // count of filteredTransactions
  totalSpend: number                    // filtered by selectedMonth
  topCategory: string | null            // filtered by selectedMonth
  avgMonthlySavings: number             // overall average across all months (not filtered)
  dateRange: DateRange
  isLoading: boolean
  error: string | null
  // Month filter
  selectedMonth: string | null  // 'YYYY-MM' or null (shows all)
  availableMonths: string[]     // 'YYYY-MM' strings derived from transactions, newest first
  setSelectedMonth: (month: string | null) => void
  // Upload history
  uploads: Upload[]
  statementCount: number
  loadUploads: () => Promise<void>
  // Core actions
  loadTransactions: () => Promise<void>
  addTransactions: (newTransactions: Transaction[]) => void
  updateTransactionCategory: (transactionId: string, category: string) => Promise<void>
  clearError: () => void
}