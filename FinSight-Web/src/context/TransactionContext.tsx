/**
 * TransactionContext & TransactionProvider - Transaction State Management
 *
 * Manages all user transactions for the entire app.
 * Provides centralised fetching, filtering, and client-side merging.
 *
 * Key features:
 * - Month filter: availableMonths derived from data, selectedMonth drives filtered stats
 * - Upload history: uploads list with load operation
 * - Stats (totalCount, totalSpend, topCategory) computed from month-filtered transactions
 * - avgMonthlySavings is always the overall average (not filtered per-month)
 */

import { createContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import type { Transaction, DateRange, TransactionContextType, Upload } from '../models'
import { getTransactionsApi, updateCategoryApi, getUploadsApi, getPreSalaryBalanceApi } from '../api/upload'

export const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

interface TransactionProviderProps {
  children: ReactNode
}

export const TransactionProvider = ({ children }: TransactionProviderProps) => {
  // ── Core transaction state ──────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dateRange, setDateRange]       = useState<DateRange>({ from: null, to: null })
  const [isLoading, setIsLoading]       = useState<boolean>(false)
  const [error, setError]               = useState<string | null>(null)

  // ── Month filter ────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  // ── Upload history state ────────────────────────────────────────
  const [uploads, setUploads] = useState<Upload[]>([])

  // ── Pre-salary balance (fetched from backend when selectedMonth changes) ──
  const [preSalaryBalance, setPreSalaryBalance] = useState<number | null>(null)
  const [preSalaryAccounts, setPreSalaryAccounts] = useState<import('../models').AccountOpeningBalance[]>([])

  // ── Available months (derived from transactions, newest first) ──
  // Bank transactions: month derived from date
  // CC transactions: month derived from billing_month
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>()
    for (const t of transactions) {
      if (t.account_type === 'credit_card' && t.billing_month) {
        monthSet.add(t.billing_month)
      } else {
        monthSet.add(t.date.slice(0, 7))
      }
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a))
  }, [transactions])

  // ── Salary-based spending window ───────────────────────────────
  // The "spending period" for a given month runs from the salary that
  // funded it (previous month's salary arriving on day >= 20) through
  // to the day before the next salary arrives (current month day >= 20).
  // Falls back to calendar month bounds when no anchoring salary exists.
  const SALARY_SHIFT_DAY = 20

  /**
   * Compute the salary-window bounds for any 'YYYY-MM' string.
   * Pure function — extracted so it can be reused for every available month
   * (not just the currently selected one) when building transactionsByMonth.
   */
  const computeSalaryWindow = useCallback(
    (ym: string): { start: string; end: string } => {
      const [y, m] = ym.split('-').map(Number)
      const prevMonth = m === 1
        ? `${y - 1}-12`
        : `${y}-${String(m - 1).padStart(2, '0')}`

      const prevLateSalaries = transactions
        .filter(t =>
          t.category === 'Salary' && t.type === 'credit' &&
          t.date.startsWith(prevMonth) &&
          parseInt(t.date.slice(8, 10), 10) >= SALARY_SHIFT_DAY
        )
        .sort((a, b) => a.date.localeCompare(b.date))

      const currLateSalaries = transactions
        .filter(t =>
          t.category === 'Salary' && t.type === 'credit' &&
          t.date.startsWith(ym) &&
          parseInt(t.date.slice(8, 10), 10) >= SALARY_SHIFT_DAY
        )
        .sort((a, b) => a.date.localeCompare(b.date))

      const windowStart = prevLateSalaries.length > 0
        ? prevLateSalaries[0].date
        : `${ym}-01`

      let windowEnd: string
      if (currLateSalaries.length > 0) {
        const d = new Date(currLateSalaries[0].date)
        d.setDate(d.getDate() - 1)
        windowEnd = d.toISOString().slice(0, 10)
      } else {
        windowEnd = new Date(y, m, 0).toISOString().slice(0, 10)
      }

      return { start: windowStart, end: windowEnd }
    },
    [transactions]
  )

  const salaryWindow = useMemo(
    () => selectedMonth ? computeSalaryWindow(selectedMonth) : null,
    [selectedMonth, computeSalaryWindow]
  )

  // ── Per-month transaction slices (salary-window-adjusted) ───────
  // Used by analytics trend charts so every month's bar shows the same
  // transactions the dashboard shows when you select that month tab.
  // Bank transactions are sliced by each month's salary window;
  // CC transactions are sliced by billing_month.
  const transactionsByMonth = useMemo(() => {
    const bankTxns = transactions.filter(t => t.account_type !== 'credit_card')
    const ccTxns   = transactions.filter(t => t.account_type === 'credit_card')
    const map: Record<string, Transaction[]> = {}
    for (const ym of availableMonths) {
      const window = computeSalaryWindow(ym)
      const filteredBank = bankTxns.filter(t => t.date >= window.start && t.date <= window.end)
      const filteredCC   = ccTxns.filter(t => t.billing_month === ym)
      map[ym] = [...filteredBank, ...filteredCC]
    }
    return map
  }, [transactions, availableMonths, computeSalaryWindow])

  // ── Month-filtered transaction slice ────────────────────────────
  // Bank transactions: salary window (or calendar month fallback)
  // CC transactions: billing_month === selectedMonth
  const filteredTransactions = useMemo(() => {
    if (!selectedMonth) return transactions

    const bankTxns = transactions.filter(t => t.account_type !== 'credit_card')
    const ccTxns   = transactions.filter(t => t.account_type === 'credit_card')

    const filteredBank = salaryWindow
      ? bankTxns.filter(t => t.date >= salaryWindow.start && t.date <= salaryWindow.end)
      : bankTxns.filter(t => t.date.startsWith(selectedMonth))

    const filteredCC = ccTxns.filter(t => t.billing_month === selectedMonth)

    return [...filteredBank, ...filteredCC]
  }, [transactions, selectedMonth, salaryWindow])

  // ── Derived stats (from filtered slice) ────────────────────────

  const totalCount = filteredTransactions.length

  // Since filteredTransactions already spans the salary window (prev-month late
  // salary → day before current-month late salary), totalIncome is simply the
  // sum of all Salary credits within that window.
  const totalIncome = useMemo(() =>
    filteredTransactions
      .filter(t => t.category === 'Salary' && t.type === 'credit')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [filteredTransactions]
  )

  const totalSpend = useMemo(() => {
    const debits = filteredTransactions
      .filter(t => t.type === 'debit' && t.category !== 'Transfers' && t.category !== 'Salary')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const reimbursements = filteredTransactions
      .filter(t => t.type === 'credit' && t.category !== 'Salary' && t.category !== 'Transfers')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    return Math.max(0, debits - reimbursements)
  }, [filteredTransactions])

  const topCategory = useMemo(() => {
    const spendByCategory: Record<string, number> = {}
    for (const t of filteredTransactions) {
      if (t.type !== 'debit') continue
      const cat = t.category || 'Uncategorised'
      spendByCategory[cat] = (spendByCategory[cat] ?? 0) + Math.abs(t.amount)
    }
    const entries = Object.entries(spendByCategory)
    if (entries.length === 0) return null
    return entries.reduce((best, curr) => curr[1] > best[1] ? curr : best)[0]
  }, [filteredTransactions])

  /**
   * totalInvestments — sum of Investments-category debits in the current salary window
   * (same filteredTransactions source as totalSpend / totalIncome).
   * Used on the dashboard "Total Savings" card so it matches the analytics view exactly.
   */
  const totalInvestments = useMemo(() =>
    filteredTransactions
      .filter(t => t.type === 'debit' && t.category === 'Investments')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [filteredTransactions]
  )

  /**
   * avgMonthlySavings — overall average monthly investment across all history.
   * Kept for any future cross-month baseline comparisons.
   */
  const avgMonthlySavings = useMemo(() => {
    const monthlyTotals: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== 'debit' || t.category !== 'Investments') continue
      const month = t.date.slice(0, 7)
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + Math.abs(t.amount)
    }
    const months = Object.values(monthlyTotals)
    return months.length === 0 ? 0 : months.reduce((s, v) => s + v, 0) / months.length
  }, [transactions])

  /** Number of completed uploads — used by DataSourcesStrip */
  const statementCount = uploads.length

  // ── Fetch pre-salary balance whenever selected month changes ────
  useEffect(() => {
    if (!selectedMonth) {
      setPreSalaryBalance(null)
      setPreSalaryAccounts([])
      return
    }
    getPreSalaryBalanceApi(selectedMonth)
      .then(data => {
        setPreSalaryBalance(data.total_opening_balance)
        setPreSalaryAccounts(data.accounts)
      })
      .catch(() => {
        setPreSalaryBalance(null)
        setPreSalaryAccounts([])
      })
  }, [selectedMonth])

  // ── Load transactions from backend ─────────────────────────────
  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getTransactionsApi()
      setTransactions(data.transactions)
      setDateRange(data.date_range)

      // Auto-select most recent month on first load
      if (data.transactions.length > 0) {
        const months = Array.from(
          new Set(data.transactions.map(t => t.date.slice(0, 7)))
        ).sort((a, b) => b.localeCompare(a))
        setSelectedMonth(prev => prev ?? months[0] ?? null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load transactions'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Merge new transactions after upload ─────────────────────────
  const addTransactions = useCallback((newTransactions: Transaction[]) => {
    setTransactions(prev => [...newTransactions, ...prev])

    if (newTransactions.length > 0) {
      const newDates = newTransactions.map(t => t.date).sort()
      const newFromDate = newDates[0]
      const newToDate   = newDates[newDates.length - 1]
      setDateRange(prev => ({
        from: prev.from ? (newFromDate < prev.from ? newFromDate : prev.from) : newFromDate,
        to:   prev.to   ? (newToDate   > prev.to   ? newToDate   : prev.to)   : newToDate,
      }))
    }
  }, [])

  // ── Update single transaction category ──────────────────────────
  const updateTransactionCategory = useCallback(async (
    transactionId: string,
    category: string
  ): Promise<void> => {
    await updateCategoryApi(transactionId, category)
    setTransactions(prev =>
      prev.map(t =>
        t.transaction_id === transactionId
          ? { ...t, category, confidence: 'user_confirmed' }
          : t
      )
    )
  }, [])

  const clearError = useCallback(() => setError(null), [])

  // ── Upload history ──────────────────────────────────────────────
  const loadUploads = useCallback(async () => {
    try {
      const data = await getUploadsApi()
      setUploads(data)
    } catch {
      // silently fail — strip just won't show
    }
  }, [])

  // ── Context value ───────────────────────────────────────────────
  const value: TransactionContextType = {
    transactions,
    filteredTransactions,
    transactionsByMonth,
    totalCount,
    totalSpend,
    totalIncome,
    preSalaryBalance,
    preSalaryAccounts,
    topCategory,
    totalInvestments,
    avgMonthlySavings,
    dateRange,
    isLoading,
    error,
    selectedMonth,
    availableMonths,
    setSelectedMonth,
    uploads,
    statementCount,
    loadUploads,
    loadTransactions,
    addTransactions,
    updateTransactionCategory,
    clearError,
  }

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  )
}
