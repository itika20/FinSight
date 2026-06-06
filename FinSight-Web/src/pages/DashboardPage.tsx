/**
 * DashboardPage — Main view after login.
 *
 * Layout (Option A — viewport-fill):
 *   h-screen flex flex-col, no page scroll
 *   1. Top bar           — flex-shrink-0
 *   2. Sticky controls   — flex-shrink-0 (stat bar + month tabs + datasource)
 *   3. Scrollable area   — flex-1 overflow-y-auto  (table only scrolls here)
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransactions } from '../hooks/useTransactions'
import UploadModal from '../components/upload/UploadModal'
import TransactionTable from '../components/transactions/TransactionTable'
import ManageStatementsModal from '../components/dashboard/ManageStatementsModal'
import UserMenu from '../components/shared/UserMenu'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM' → 'Jan 2026' */
const fmtMonth = (ym: string): string => {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** 'YYYY-MM-DD' → 'Jan 2026' */
const fmtMonthYear = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

// ─── component ─────────────────────────────────────────────────────────────────

const DashboardPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const {
    filteredTransactions,
    totalCount, totalSpend, totalIncome, preSalaryBalance, preSalaryAccounts, totalInvestments,
    isLoading, error,
    dateRange,
    selectedMonth, availableMonths, setSelectedMonth,
    uploads, statementCount,
    loadUploads, loadTransactions, clearError, addTransactions,
  } = useTransactions()

  const [isUploadModalOpen,    setIsUploadModalOpen]    = useState(false)
  const [isManageModalOpen,    setIsManageModalOpen]    = useState(false)
  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false)
  const [showIncomeBreakdown,  setShowIncomeBreakdown]  = useState(false)

  // Refs for ⓘ buttons — used to anchor fixed-position popovers so they
  // escape the overflow-x-auto container without causing scroll.
  const balanceBtnRef = useRef<HTMLButtonElement>(null)
  const incomeBtnRef  = useRef<HTMLButtonElement>(null)
  const [balancePopoverPos, setBalancePopoverPos] = useState<{ top: number; left: number } | null>(null)
  const [incomePopoverPos,  setIncomePopoverPos]  = useState<{ top: number; left: number } | null>(null)

  const openBalancePopover = () => {
    if (balanceBtnRef.current) {
      const r = balanceBtnRef.current.getBoundingClientRect()
      setBalancePopoverPos({ top: r.bottom + 8, left: r.left })
    }
    setShowBalanceBreakdown(true)
  }
  const openIncomePopover = () => {
    if (incomeBtnRef.current) {
      const r = incomeBtnRef.current.getBoundingClientRect()
      setIncomePopoverPos({ top: r.bottom + 8, left: r.left })
    }
    setShowIncomeBreakdown(true)
  }

  const salaryTransactions = useMemo(
    () => filteredTransactions.filter(t => t.category === 'Salary' && t.type === 'credit'),
    [filteredTransactions]
  )

  useEffect(() => {
    loadTransactions()
    loadUploads()
  }, [loadTransactions, loadUploads])

  const handleUploadSuccess = (transactions: any[]) => {
    addTransactions(transactions)
    loadUploads()
    setIsUploadModalOpen(false)
  }

  const handleStatementDeleted = () => {
    loadTransactions()
    loadUploads()
  }

  const hasData = totalCount > 0 || availableMonths.length > 0

  const totalAvailable = preSalaryBalance != null
    ? preSalaryBalance + totalIncome
    : totalIncome > 0 ? totalIncome : null

  const dataSourceRange = dateRange.from && dateRange.to
    ? `${fmtMonthYear(dateRange.from)} → ${fmtMonthYear(dateRange.to)}`
    : null

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gray-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <button onClick={() => navigate('/dashboard')} className="text-left hover:opacity-75 transition-opacity">
          <h1 className="text-xl font-bold text-gray-900">FinSight</h1>
          <p className="text-xs text-gray-400">Personal Finance Analyser</p>
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/goals')}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Set a Goal
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Upload Statement
          </button>
          <UserMenu email={user?.email} onLogout={logout} />
        </div>
      </div>

      {/* ── Sticky controls — only when data is loaded ── */}
      {hasData && !isLoading && (
        <div className="bg-white border-b border-gray-200 flex-shrink-0">

          {/* Compact stat bar */}
          <div className="flex items-stretch overflow-x-auto">

            {/* Pre-Salary Savings */}
            {/* Pre-Salary Savings */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Pre-Salary Savings</span>
                {preSalaryBalance != null && (
                  <button
                    ref={balanceBtnRef}
                    className="w-4 h-4 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors flex-shrink-0"
                    onMouseEnter={openBalancePopover}
                    onMouseLeave={() => setShowBalanceBreakdown(false)}
                    onClick={openBalancePopover}
                    aria-label="How this is calculated"
                  >
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
              {preSalaryBalance != null ? (
                <p className={`text-xl font-bold mt-1 whitespace-nowrap ${preSalaryBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {'₹' + preSalaryBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : (
                <p className="text-xl font-bold mt-1 text-gray-300">—</p>
              )}
            </div>

            {/* Salary In */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Salary In</span>
                <button
                  ref={incomeBtnRef}
                  className="w-4 h-4 rounded-full bg-gray-100 hover:bg-emerald-100 text-gray-400 hover:text-emerald-500 flex items-center justify-center transition-colors flex-shrink-0"
                  onMouseEnter={openIncomePopover}
                  onMouseLeave={() => setShowIncomeBreakdown(false)}
                  onClick={openIncomePopover}
                  aria-label="Salary transactions this period"
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <p className="text-xl font-bold mt-1 text-emerald-600 whitespace-nowrap">
                {'₹' + totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Total Available */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Total Available</p>
              <p className="text-xl font-bold mt-1 text-indigo-600 whitespace-nowrap">
                {totalAvailable != null
                  ? '₹' + totalAvailable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '—'}
              </p>
            </div>

            {/* Total Spend */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Total Spend</p>
              <p className="text-xl font-bold mt-1 text-red-500 whitespace-nowrap">
                {'₹' + totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Investments */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Investments</p>
              <p className="text-xl font-bold mt-1 text-gray-700 whitespace-nowrap">
                {totalInvestments > 0
                  ? '₹' + totalInvestments.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                  : '—'}
              </p>
            </div>

            {/* Transactions count */}
            <div className="px-6 py-5 flex-shrink-0 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-400 whitespace-nowrap uppercase tracking-wide">Transactions</p>
              <p className="text-xl font-bold mt-1 text-gray-700">
                {totalCount.toLocaleString('en-IN')}
              </p>
            </div>

            {/* Spacer */}
            <div className="flex-1 min-w-4" />

            {/* Analytics — styled as a prominent button */}
            <div className="px-6 py-5 flex-shrink-0 flex items-center">
              <button
                onClick={() => navigate('/analytics')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Analytics
              </button>
            </div>
          </div>

          {/* Month tabs row */}
          <div className="px-6 py-2 border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {availableMonths.map(ym => (
                <button
                  key={ym}
                  onClick={() => setSelectedMonth(ym)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedMonth === ym
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                  }`}
                >
                  {fmtMonth(ym)}
                </button>
              ))}
            </div>

            {/* Inline data source info */}
            {statementCount > 0 && (
              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{statementCount}</span>{' '}
                  {statementCount === 1 ? 'statement' : 'statements'}
                  {dataSourceRange && <span className="text-gray-300"> · {dataSourceRange}</span>}
                </p>
                <button
                  onClick={() => setIsManageModalOpen(true)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors whitespace-nowrap"
                >
                  Manage
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scrollable main area ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Empty state */}
        {!hasData && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800">Upload your transactions to identify patterns</h2>
              <p className="text-sm text-gray-400 mt-2 max-w-sm">
                Upload your bank statement and we'll analyse your spending and help you understand your finances.
              </p>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Upload your first statement
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="p-6 flex flex-col gap-3">
            {/* Simulated table rows */}
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-100 px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-20 flex-shrink-0" />
                <div className="h-3 bg-gray-200 rounded flex-1" />
                <div className="h-3 bg-gray-200 rounded w-20 flex-shrink-0" />
                <div className="h-5 bg-gray-200 rounded-full w-16 flex-shrink-0" />
                <div className="h-5 bg-gray-200 rounded-full w-20 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900">Failed to load transactions</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
            </div>
            <button
              onClick={() => { clearError(); loadTransactions() }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Transaction table */}
        {hasData && !isLoading && (
          <div className="p-6">
            <TransactionTable />
          </div>
        )}
      </div>

      {/* ── Fixed-position popovers (escape overflow-x-auto entirely) ── */}
      {showBalanceBreakdown && preSalaryBalance != null && balancePopoverPos && (
        <div
          className="fixed z-50 w-80 bg-white rounded-xl border border-blue-100 shadow-xl p-4"
          style={{ top: balancePopoverPos.top, left: balancePopoverPos.left }}
          onMouseEnter={openBalancePopover}
          onMouseLeave={() => setShowBalanceBreakdown(false)}
        >
          <p className="text-xs font-semibold text-gray-700 mb-1">What you had before salary</p>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Balance across your accounts <span className="font-medium">just before this period's salary arrived</span>.
            This is what you saved and carried forward from last month.
          </p>
          <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
            {preSalaryAccounts.map((a: { upload_id: string; filename: string; opening_balance: number }) => (
              <div key={a.upload_id} className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 truncate" title={a.filename}>{a.filename}</span>
                <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                  {'₹' + a.opening_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            {preSalaryAccounts.length > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1.5 mt-0.5">
                <span className="text-xs font-semibold text-gray-600">Total</span>
                <span className="text-xs font-bold text-blue-600">
                  {'₹' + preSalaryBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {showIncomeBreakdown && incomePopoverPos && (
        <div
          className="fixed z-50 w-72 bg-white rounded-xl border border-emerald-100 shadow-xl p-4"
          style={{ top: incomePopoverPos.top, left: incomePopoverPos.left }}
          onMouseEnter={openIncomePopover}
          onMouseLeave={() => setShowIncomeBreakdown(false)}
        >
          <p className="text-xs font-semibold text-gray-700 mb-1">Salary in this spending period</p>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            All salary credits within your spending window for this month.
          </p>
          {salaryTransactions.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No salary transactions in this period.</p>
          ) : (
            <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
              {salaryTransactions.map(t => (
                <div key={t.transaction_id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate" title={t.description}>{t.description}</p>
                    <p className="text-xs text-gray-400">{t.date}</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 flex-shrink-0">
                    {'₹' + Math.abs(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />
      <ManageStatementsModal
        isOpen={isManageModalOpen}
        uploads={uploads}
        onClose={() => setIsManageModalOpen(false)}
        onDeleted={handleStatementDeleted}
      />
    </div>
  )
}

export default DashboardPage
