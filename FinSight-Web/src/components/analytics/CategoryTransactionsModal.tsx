/**
 * CategoryTransactionsModal
 *
 * Opens when the user clicks a slice on the Spending Donut chart.
 * Lists every transaction in the selected category (for the current
 * salary-window period) with the same editable category pill used in
 * TransactionTable — changes persist to the DB and update VPA memory,
 * and the change propagates to the main grid and the donut chart
 * automatically via TransactionContext.
 */

import { useState, useEffect, useRef } from 'react'
import { useTransactions } from '../../hooks/useTransactions'
import type { Transaction } from '../../models'
import { TRANSACTION_CATEGORIES, CATEGORY_COLORS } from '../../constants/config'

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtAmount = (amount: number) =>
  Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const fmtDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const getCatColor = (cat?: string | null) =>
  CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'

const fmtRupee = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN')

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  category: string
  color: string
  transactions: Transaction[]   // pre-filtered to this category by the parent
  onClose: () => void
}

// ─── component ────────────────────────────────────────────────────────────────

const CategoryTransactionsModal = ({ category, color, transactions, onClose }: Props) => {
  const { updateTransactionCategory } = useTransactions()

  // ── category edit state (per row) ─────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId,  setSavingId]  = useState<string | null>(null)
  const [savedId,   setSavedId]   = useState<string | null>(null)
  const [errorId,   setErrorId]   = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // close dropdown on outside click
  useEffect(() => {
    if (!editingId) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editingId])

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleCategorySelect = async (txnId: string, newCategory: string) => {
    setEditingId(null)
    setSavingId(txnId)
    setErrorId(null)
    try {
      await updateTransactionCategory(txnId, newCategory)
      setSavedId(txnId)
      setTimeout(() => setSavedId(p => p === txnId ? null : p), 2000)
    } catch {
      setErrorId(txnId)
      setTimeout(() => setErrorId(p => p === txnId ? null : p), 3000)
    } finally {
      setSavingId(null)
    }
  }

  // ── summary numbers ────────────────────────────────────────────────────────
  const totalDebit = transactions
    .filter(t => t.type === 'debit')
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalCredit = transactions
    .filter(t => t.type === 'credit')
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const netSpend = Math.max(0, totalDebit - totalCredit)

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
        onClick={onClose}
      >
        {/* modal */}
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col z-50"
          onClick={e => e.stopPropagation()}
        >
          {/* header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: color }}
              />
              <div>
                <h2 className="text-base font-semibold text-gray-900">{category}</h2>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs font-medium text-red-500">
                    {fmtRupee(totalDebit)} spent
                  </span>
                  {totalCredit > 0 && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs font-medium text-green-600">
                        {fmtRupee(totalCredit)} refunded
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs font-semibold text-gray-700">
                        {fmtRupee(netSpend)} net
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* hint */}
          <p className="px-6 py-2.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100 flex-shrink-0">
            Click any category badge to reclassify — changes update the main grid and train future auto-categorisation.
          </p>

          {/* transaction list */}
          <div className="overflow-y-auto flex-1">
            {sorted.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No transactions.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Description</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((txn, idx) => {
                    const isDebit   = txn.type === 'debit'
                    const isSaving  = savingId === txn.transaction_id
                    const isSaved   = savedId  === txn.transaction_id
                    const isError   = errorId  === txn.transaction_id
                    const isEditing = editingId === txn.transaction_id
                    const catLabel  = txn.category || 'Uncategorised'
                    const catColor  = getCatColor(txn.category)

                    return (
                      <tr
                        key={txn.transaction_id}
                        className={`border-b border-gray-50 hover:bg-blue-50/20 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                      >
                        {/* date */}
                        <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap align-middle">
                          {fmtDate(txn.date)}
                        </td>

                        {/* description */}
                        <td className="px-5 py-3.5 max-w-[220px] align-middle">
                          <p className="text-sm text-gray-700 truncate" title={txn.description}>
                            {txn.description}
                          </p>
                        </td>

                        {/* amount */}
                        <td className={`px-5 py-3.5 text-sm font-semibold text-right whitespace-nowrap tabular-nums align-middle ${isDebit ? 'text-red-500' : 'text-green-600'}`}>
                          {isDebit ? '−' : '+'}₹{fmtAmount(txn.amount)}
                        </td>

                        {/* editable category pill */}
                        <td className="px-5 py-3.5 align-middle">
                          {isSaving ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                              <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                              Saving…
                            </span>
                          ) : isSaved ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Saved
                            </span>
                          ) : isError ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Failed
                            </span>
                          ) : (
                            <div className="relative inline-block" ref={isEditing ? dropdownRef : null}>
                              <button
                                onClick={() => setEditingId(isEditing ? null : txn.transaction_id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white transition-opacity hover:opacity-80 cursor-pointer"
                                style={{ backgroundColor: catColor }}
                                title="Click to change category"
                              >
                                {catLabel}
                                <svg
                                  className={`w-3 h-3 flex-shrink-0 transition-transform ${isEditing ? 'rotate-180' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>

                              {isEditing && (
                                <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[200px] max-h-56 overflow-y-auto">
                                  <p className="px-3 pt-1 pb-2 text-xs text-gray-400 border-b border-gray-100 font-medium">
                                    Select category
                                  </p>
                                  {TRANSACTION_CATEGORIES.map(cat => {
                                    const isActive = catLabel === cat
                                    return (
                                      <button
                                        key={cat}
                                        onClick={() => handleCategorySelect(txn.transaction_id, cat)}
                                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                      >
                                        <span
                                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                                        />
                                        <span className={`flex-1 ${isActive ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                                          {cat}
                                        </span>
                                        {isActive && (
                                          <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default CategoryTransactionsModal
