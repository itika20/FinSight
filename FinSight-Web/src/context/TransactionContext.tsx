/**
 * TransactionContext & TransactionProvider - Transaction State Management
 *
 * Manages all user transactions for the entire app.
 * Provides centralized fetching, filtering, and client-side merging.
 *
 * Architecture:
 * - App.tsx wraps entire app with <TransactionProvider>
 * - Components use useTransactions() hook to access state
 * - Context manages backend communication
 * - Multiple components can subscribe to transactions
 *
 * Caching Strategy:
 * - Transactions cached in React state
 * - Initial load on first mount
 * - Manual refresh via loadTransactions() if needed
 * - Merging for new uploads (addTransactions)
 * - No periodic polling
 */

import { createContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { Transaction, DateRange, TransactionContextType } from '../models'
import { getTransactionsApi, updateCategoryApi } from '../api/upload'

/**
 * React Context for Transaction State
 *
 * Stores all user transactions and metadata.
 * Never import directly — use useTransactions() hook instead.
 */
export const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

interface TransactionProviderProps {
  /** Entire app component tree that needs access to transactions */
  children: ReactNode
}

/**
 * Provider Component - Wraps app to enable useTransactions() hook.
 *
 * Manages:
 * - Fetching transactions from backend
 * - Caching in React state
 * - Client-side merging after upload
 * - Loading and error states
 * - Date range computation
 *
 * Setup:
 * ```
 * // App.tsx
 * import { TransactionProvider } from './context/TransactionContext'
 * import { Dashboard } from './pages/Dashboard'
 *
 * export function App() {
 *   return (
 *     <TransactionProvider>
 *       <Dashboard />
 *     </TransactionProvider>
 *   )
 * }
 * ```
 *
 * Usage in Components:
 * ```
 * function MyComponent() {
 *   const { transactions, isLoading, error, loadTransactions } = useTransactions()
 *
 *   useEffect(() => {
 *     loadTransactions()
 *   }, [loadTransactions])
 *
 *   return (...)
 * }
 * ```
 */
export const TransactionProvider = ({ children }: TransactionProviderProps) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /** All transactions for current user (sorted by date descending) */
  const [transactions, setTransactions] = useState<Transaction[]>([])

  /** Total transaction count (used for stats) */
  const [totalCount, setTotalCount] = useState<number>(0)

  /** Date range of all transactions (min/max dates) */
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null })

  /** True while fetching from backend */
  const [isLoading, setIsLoading] = useState<boolean>(false)

  /** Error message if fetch fails (null if no error) */
  const [error, setError] = useState<string | null>(null)

  // ============================================================================
  // FETCH TRANSACTIONS FROM BACKEND
  // ============================================================================

  /**
   * Fetch all transactions from backend for current user.
   *
   * Called:
   * - On component mount (App or Dashboard)
   * - On manual refresh (retry after error)
   * - When filters change (if implemented)
   *
   * Process:
   * 1. Set isLoading=true (show skeleton UI)
   * 2. Call GET /upload/transactions
   * 3. Backend returns all transactions + metadata
   * 4. Update state with results
   * 5. Set isLoading=false
   * 6. On error, set error message, update state to null
   *
   * useCallback ensures stable reference (can be used in useEffect)
   */
  const loadTransactions = useCallback(async () => {
    console.log('[TransactionContext] Loading transactions...')
    setIsLoading(true)
    setError(null)

    try {
      const data = await getTransactionsApi()
      console.log(`[TransactionContext] Loaded ${data.transactions.length} transactions`)

      setTransactions(data.transactions)
      setTotalCount(data.total_count)
      setDateRange(data.date_range)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transactions'
      console.warn('[TransactionContext] Error loading transactions:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ============================================================================
  // MERGE NEW TRANSACTIONS (After Upload)
  // ============================================================================

  /**
   * Add new transactions from successful upload.
   *
   * Called by:
   * - UploadModal after parse succeeds
   * - Parent component's onUploadSuccess callback
   *
   * Process:
   * 1. Prepend new transactions to existing list (new first)
   * 2. Increment total count
   * 3. Update date range if needed
   *
   * Benefits:
   * - Instant UI update without page reload
   * - Most recent transactions appear at top
   * - Client-side only (no API call)
   * - Dashboard updates automatically
   *
   * Example:
   * ```
   * const { addTransactions } = useTransactions()
   * const handleUploadSuccess = (newTransactions) => {
   *   addTransactions(newTransactions)  // Merge instantly
   * }
   * ```
   *
   * useCallback ensures stable reference (can be passed to children)
   */
  const addTransactions = useCallback((newTransactions: Transaction[]) => {
    console.log(`[TransactionContext] Adding ${newTransactions.length} new transactions`)

    setTransactions((prev) => [...newTransactions, ...prev])
    setTotalCount((prev) => prev + newTransactions.length)

    // Update date range if new transactions extend it
    if (newTransactions.length > 0) {
      const newDates = newTransactions.map((t) => t.date).sort()
      const newFromDate = newDates[0]
      const newToDate = newDates[newDates.length - 1]

      setDateRange((prev) => ({
        from: prev.from ? (newFromDate < prev.from ? newFromDate : prev.from) : newFromDate,
        to: prev.to ? (newToDate > prev.to ? newToDate : prev.to) : newToDate
      }))

      console.log(`[TransactionContext] Date range updated: ${newFromDate} to ${newToDate}`)
    }
  }, [])

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Clear error message for retry.
   *
   * Called when:
   * - User clicks "Retry" button after error
   * - User dismisses error UI
   *
   * useCallback ensures stable reference (can be passed to children)
   */
  const clearError = useCallback(() => {
    console.log('[TransactionContext] Clearing error')
    setError(null)
  }, [])

  // ============================================================================
  // UPDATE TRANSACTION CATEGORY
  // ============================================================================

  /**
   * Update a single transaction's category and persist it to the backend.
   *
   * Called when a user corrects an ML-assigned category from the dashboard.
   *
   * Process:
   * 1. Call PATCH /upload/transactions/{id}/category
   * 2. Backend updates DB + saves VPA → category to user_vpa_memory
   *    (so future uploads with the same merchant auto-categorise correctly)
   * 3. Update local state immediately so the UI reflects the change
   *    without a full refetch
   *
   * The confidence is set to 'user_confirmed' locally to match what the
   * backend stores, so the confidence badge updates instantly.
   *
   * @throws Re-throws API errors so the calling component can show feedback
   */
  const updateTransactionCategory = useCallback(async (
    transactionId: string,
    category: string
  ): Promise<void> => {
    console.log(`[TransactionContext] Updating category: txn=${transactionId} → ${category}`)

    await updateCategoryApi(transactionId, category)

    // Update local state — marks as user_confirmed so confidence badge updates instantly
    setTransactions(prev =>
      prev.map(t =>
        t.transaction_id === transactionId
          ? { ...t, category, confidence: 'user_confirmed' }
          : t
      )
    )

    console.log(`[TransactionContext] Category updated locally: ${transactionId} → ${category}`)
  }, [])

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================

  /** Sum of all debit transaction amounts — recomputed only when transactions change */
  const totalSpend = useMemo(
    () => transactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [transactions]
  )

  /**
   * Monthly average of Investments-category debit transactions.
   * Groups all qualifying transactions by calendar month, sums each month,
   * then returns the mean across months. Returns 0 when no data exists.
   */
  const avgMonthlySavings = useMemo(() => {
    const monthlyTotals: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== 'debit' || t.category !== 'Investments') continue
      const month = t.date.slice(0, 7)   // 'YYYY-MM'
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + Math.abs(t.amount)
    }
    const months = Object.values(monthlyTotals)
    return months.length === 0 ? 0 : months.reduce((s, v) => s + v, 0) / months.length
  }, [transactions])

  /**
   * Category with the highest total debit spend.
   * Groups all debit transactions by category, sums each group, returns the top one.
   * Null if there are no categorised debit transactions.
   */
  const topCategory = useMemo(() => {
    const spendByCategory: Record<string, number> = {}

    for (const t of transactions) {
      if (t.type !== 'debit') continue
      const cat = t.category || 'Uncategorised'
      spendByCategory[cat] = (spendByCategory[cat] ?? 0) + Math.abs(t.amount)
    }

    const entries = Object.entries(spendByCategory)
    if (entries.length === 0) return null

    return entries.reduce((best, curr) => curr[1] > best[1] ? curr : best)[0]
  }, [transactions])

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  /**
   * Assemble context with all state and methods.
   *
   * Every property here accessible via useTransactions() hook.
   */
  const value: TransactionContextType = {
    transactions,
    totalCount,
    totalSpend,
    topCategory,
    avgMonthlySavings,
    dateRange,
    isLoading,
    error,
    loadTransactions,
    addTransactions,
    updateTransactionCategory,
    clearError
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  )
}
