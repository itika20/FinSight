import { useContext } from 'react'
import { TransactionContext } from '../context/TransactionContext'
import type { TransactionContextType } from '../models'

export const useTransactions = (): TransactionContextType => {
  const context = useContext(TransactionContext)

  if (context === undefined) {
    throw new Error('useTransactions must be used within TransactionProvider')
  }

  return context
}
