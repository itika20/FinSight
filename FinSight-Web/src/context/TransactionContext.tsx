import { createContext, useState, useCallback, type ReactNode } from 'react'
import type { Transaction, DateRange, TransactionContextType } from '../models'
import { getTransactionsApi } from '../api/upload'

export const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

interface TransactionProviderProps {
  children: ReactNode
}

export const TransactionProvider = ({ children }: TransactionProviderProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null })
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch transactions from backend
  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await getTransactionsApi()
      setTransactions(data.transactions)
      setTotalCount(data.total_count)
      setDateRange(data.date_range)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transactions'
      setError(errorMessage)
      console.error('Error loading transactions:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Add new transactions from upload — prepend to list and update count
  // This merges client-side without refetching everything
  const addTransactions = useCallback((newTransactions: Transaction[]) => {
    setTransactions((prev) => [...newTransactions, ...prev])
    setTotalCount((prev) => prev + newTransactions.length)
    // Update date range if needed
    if (newTransactions.length > 0) {
      const newDates = newTransactions.map((t) => t.date).sort()
      const newFromDate = newDates[0]
      const newToDate = newDates[newDates.length - 1]
      setDateRange((prev) => ({
        from: prev.from ? (newFromDate < prev.from ? newFromDate : prev.from) : newFromDate,
        to: prev.to ? (newToDate > prev.to ? newToDate : prev.to) : newToDate
      }))
    }
  }, [])

  // Clear error for retry
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value: TransactionContextType = {
    transactions,
    totalCount,
    dateRange,
    isLoading,
    error,
    loadTransactions,
    addTransactions,
    clearError
  }

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  )
}
