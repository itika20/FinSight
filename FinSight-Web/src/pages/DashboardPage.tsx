/**
 * DashboardPage — Main view after login.
 *
 * Layout (top → bottom):
 * 1. Top bar
 * 2. Stat cards (month-filtered)
 * 3. DataSourcesStrip — "Based on N statements · Jan → May 2026  [Manage]"
 * 4. Month filter tabs
 * 5. Transaction table
 *
 * ManageStatementsModal opens from the strip's [Manage] button.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransactions } from '../hooks/useTransactions'
import UploadModal from '../components/upload/UploadModal'
import TransactionTable from '../components/transactions/TransactionTable'
import DataSourcesStrip from '../components/dashboard/DataSourcesStrip'
import ManageStatementsModal from '../components/dashboard/ManageStatementsModal'
import UserMenu from '../components/shared/UserMenu'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM' → 'Jan 2026' */
const fmtMonth = (ym: string): string => {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

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

  const [isUploadModalOpen,       setIsUploadModalOpen]       = useState(false)
  const [isManageModalOpen,       setIsManageModalOpen]       = useState(false)
  const [showBalanceBreakdown,    setShowBalanceBreakdown]    = useState(false)
  const [showIncomeBreakdown,     setShowIncomeBreakdown]     = useState(false)

  // Salary credits within the salary window — used for the Total Income popover.
  // filteredTransactions already spans the correct salary-based window, so no
  // extra shift logic needed here.
  const salaryTransactions = useMemo(
    () => filteredTransactions.filter(t => t.category === 'Salary' && t.type === 'credit'),
    [filteredTransactions]
  )

  // Load transactions + upload history on mount
  useEffect(() => {
    loadTransactions()
    loadUploads()
  }, [loadTransactions, loadUploads])

  const handleUploadSuccess = (transactions: any[]) => {
    addTransactions(transactions)
    loadUploads()
    setIsUploadModalOpen(false)
  }

  // Called after any delete inside ManageStatementsModal
  const handleStatementDeleted = () => {
    loadTransactions()
    loadUploads()
  }

  const hasData = totalCount > 0 || availableMonths.length > 0

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
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

      {/* ── Main content ── */}
      <div className="px-6 py-8">

        {/* ── EMPTY STATE ── */}
        {!hasData && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
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

        {/* ── LOADING STATE ── */}
        {isLoading && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                  <div className="h-8 bg-gray-200 rounded w-32 mt-3 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-0">
              {[4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                  <div className="h-8 bg-gray-200 rounded w-32 mt-3 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center h-64">
              <div className="w-full h-full bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
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

        {/* ── HAS DATA ── */}
        {hasData && !isLoading && (
          <div className="flex flex-col gap-6">

            {/* 1. Stat cards — row 1: pre-salary savings / salary in / total available / total spend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pre-Salary Savings */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Pre-Salary Savings</p>
                  {preSalaryBalance != null && (
                    <div className="relative flex-shrink-0">
                      <button
                        className="w-4 h-4 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors"
                        onMouseEnter={() => setShowBalanceBreakdown(true)}
                        onMouseLeave={() => setShowBalanceBreakdown(false)}
                        onClick={() => setShowBalanceBreakdown(v => !v)}
                        aria-label="How this is calculated"
                      >
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {showBalanceBreakdown && (
                        <div
                          className="absolute top-full left-0 z-20 mt-1.5 w-80 bg-white rounded-xl border border-blue-100 shadow-lg p-4"
                          onMouseEnter={() => setShowBalanceBreakdown(true)}
                          onMouseLeave={() => setShowBalanceBreakdown(false)}
                        >
                          <p className="text-xs font-semibold text-gray-700 mb-1">What you had before salary</p>
                          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                            Balance across your accounts <span className="font-medium">just before this period's salary arrived</span>.
                            This is what you saved and carried forward from last month's spending.
                            If near zero, you spent almost everything last month.
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
                    </div>
                  )}
                </div>
                {preSalaryBalance != null ? (
                  <>
                    <p className={`text-2xl font-bold mt-2 ${preSalaryBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                      {'₹' + preSalaryBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">saved before salary arrived</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-300 mt-2">—</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Not available — statement has no running balance column
                    </p>
                  </>
                )}
              </div>

              {/* Salary In */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Salary In</p>
                  <div className="relative flex-shrink-0">
                    <button
                      className="w-4 h-4 rounded-full bg-gray-100 hover:bg-emerald-100 text-gray-400 hover:text-emerald-500 flex items-center justify-center transition-colors"
                      onMouseEnter={() => setShowIncomeBreakdown(true)}
                      onMouseLeave={() => setShowIncomeBreakdown(false)}
                      onClick={() => setShowIncomeBreakdown(v => !v)}
                      aria-label="Salary transactions in this period"
                    >
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {showIncomeBreakdown && (
                      <div
                        className="absolute top-full left-0 z-20 mt-1.5 w-72 bg-white rounded-xl border border-emerald-100 shadow-lg p-4"
                        onMouseEnter={() => setShowIncomeBreakdown(true)}
                        onMouseLeave={() => setShowIncomeBreakdown(false)}
                      >
                        <p className="text-xs font-semibold text-gray-700 mb-1">Salary in this spending period</p>
                        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                          All salary credits within your spending window for this month
                          (from when last month's salary arrived to the day before this month's salary).
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
                  </div>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mt-2">
                  {'₹' + totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">salary received this period</p>
              </div>

              {/* Total Available = pre-salary savings + salary in */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Available</p>
                <p className="text-2xl font-bold text-indigo-600 mt-2">
                  {preSalaryBalance != null
                    ? '₹' + (preSalaryBalance + totalIncome).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : totalIncome > 0
                      ? '₹' + totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-1">pre-salary savings + salary in</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Spend</p>
                <p className="text-2xl font-bold text-red-500 mt-2">
                  {'₹' + totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">includes investments</p>
              </div>
            </div>

            {/* Stat cards — row 2: transactions / savings / analytics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-2">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-800 mt-2">{totalCount.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Savings</p>
                <p className="text-2xl font-bold text-gray-800 mt-2">
                  {totalInvestments > 0
                    ? '₹' + totalInvestments.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {totalInvestments > 0 ? 'investments this period' : 'no investment transactions'}
                </p>
              </div>
              <button
                onClick={() => navigate('/analytics')}
                className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-blue-200 hover:shadow-sm transition-all group"
              >
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Analytics</p>
                <p className="text-2xl font-bold text-blue-600 mt-2 group-hover:text-blue-700">View →</p>
                <p className="text-xs text-gray-400 mt-1">Charts &amp; trends</p>
              </button>
            </div>

            {/* 2. Data sources strip */}
            <DataSourcesStrip
              statementCount={statementCount}
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onManageClick={() => setIsManageModalOpen(true)}
            />

            {/* 3. Month filter tabs */}
            {availableMonths.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {availableMonths.map(ym => (
                  <button
                    key={ym}
                    onClick={() => setSelectedMonth(ym)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedMonth === ym
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    {fmtMonth(ym)}
                  </button>
                ))}
              </div>
            )}

            {/* 4. Transaction table */}
            <TransactionTable />
          </div>
        )}
      </div>

      {/* Upload modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Manage statements modal */}
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
