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
  account_type?: string        // 'bank' | 'credit_card'
  billing_month?: string | null // 'YYYY-MM' for CC transactions, null for bank
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
  statement_type?: string       // 'bank' | 'credit_card'
  billing_month?: string | null // 'YYYY-MM' for CC uploads
}

export interface UploadListResponse {
  uploads: Upload[]
  total_count: number
}

export interface DeleteUploadResponse {
  message: string
  deleted_transaction_count: number
}

export interface AccountOpeningBalance {
  upload_id: string
  filename: string
  opening_balance: number
}

export interface TransactionContextType {
  transactions: Transaction[]           // full unfiltered list
  filteredTransactions: Transaction[]   // filtered by selectedMonth (or all if null)
  transactionsByMonth: Record<string, Transaction[]> // salary-window slice per available month
  totalCount: number                    // count of filteredTransactions
  totalSpend: number                    // filtered by selectedMonth
  totalIncome: number                   // sum of transactions tagged as 'Salary', filtered by selectedMonth
  preSalaryBalance: number | null        // balance across accounts BEFORE this period's salary arrived
  preSalaryAccounts: AccountOpeningBalance[]       // per-account breakdown for the pre-salary balance
  topCategory: string | null            // filtered by selectedMonth
  totalInvestments: number              // Investments debits in the selected salary window
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