/**
 * useTransactions Hook - Transaction State Management
 *
 * Provides access to transaction context for all components.
 * Handles fetching, caching, and merging of user transactions.
 *
 * Security:
 * - Only returns current user's transactions (backend enforced)
 * - Parametric queries prevent SQL injection
 * - JWT token required via axios interceptor
 *
 * Usage:
 * 1. App.tsx: <TransactionProvider> wraps app
 * 2. Components: useTransactions() to access state
 * 3. Hook enforces provider requirement
 * 4. After upload: addTransactions() merges new data
 */

import { useContext } from 'react'
import { TransactionContext } from '../context/TransactionContext'
import type { TransactionContextType } from '../models'

/**
 * Get transaction state and action methods from context.
 *
 * @returns TransactionContextType with:
 *   - transactions: All user transactions
 *   - totalCount: Total number of transactions
 *   - dateRange: Min/max transaction dates
 *   - isLoading: True while fetching
 *   - error: Error message if any
 *   - loadTransactions(): Fetch from backend
 *   - addTransactions(): Merge after upload
 *   - clearError(): Clear error for retry
 *
 * @throws Error if used outside TransactionProvider
 */
export const useTransactions = (): TransactionContextType => {
  const context = useContext(TransactionContext)

  if (context === undefined) {
    throw new Error(
      'useTransactions must be used within <TransactionProvider>. ' +
      'Ensure the Provider wraps this component tree.'
    )
  }

  return context
}
