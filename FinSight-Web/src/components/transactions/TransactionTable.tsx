/**
 * TransactionTable Component — Category Review & Correction UI
 *
 * Displays all user transactions in a table. Each row shows the ML-assigned
 * category along with a confidence indicator. Users can click any category
 * badge to open a dropdown and correct it.
 *
 * Category corrections are persisted via PATCH /upload/transactions/{id}/category.
 * The backend also saves the VPA → category mapping to user_vpa_memory, so
 * future uploads with the same merchant will be auto-categorised correctly.
 *
 * Confidence levels:
 * - user_confirmed  → Blue  "Confirmed" — user has set this manually
 * - high            → Green "Auto"      — matched a known merchant pattern
 * - medium          → Yellow "Guess"    — heuristic with reasonable signal
 * - low             → Orange "Guess"    — weak heuristic (worth reviewing)
 * - uncategorised   → Gray  "Review"   — ML could not categorise
 */

import { useState, useEffect, useRef } from 'react'
import { useTransactions } from '../../hooks/useTransactions'
import { TRANSACTION_CATEGORIES, CATEGORY_COLORS } from '../../constants/config'

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatAmount = (amount: number): string =>
  Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const formatDate = (dateStr: string): string =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const getCategoryColor = (category?: string | null): string =>
  CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'

// ─────────────────────────────────────────────
// CONFIDENCE CONFIG
// ─────────────────────────────────────────────

interface ConfidenceDisplay {
  label: string
  dotClass: string
  textClass: string
}

const CONFIDENCE_DISPLAY: Record<string, ConfidenceDisplay> = {
  user_confirmed: { label: 'Confirmed', dotClass: 'bg-blue-500',   textClass: 'text-blue-600'  },
  high:           { label: 'Auto',      dotClass: 'bg-green-500',  textClass: 'text-green-600' },
  medium:         { label: 'Guess',     dotClass: 'bg-yellow-400', textClass: 'text-yellow-600'},
  low:            { label: 'Guess',     dotClass: 'bg-orange-400', textClass: 'text-orange-500'},
  uncategorised:  { label: 'Review',   dotClass: 'bg-gray-300',   textClass: 'text-gray-400'  },
}

const getConfidenceDisplay = (confidence?: string | null): ConfidenceDisplay =>
  CONFIDENCE_DISPLAY[confidence ?? ''] ?? { label: '—', dotClass: 'bg-gray-200', textClass: 'text-gray-400' }

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

const TransactionTable = () => {
  const { filteredTransactions: transactions, updateTransactionCategory } = useTransactions()

  // ── Category column filter (Excel-style) ──────────────────────────────────
  // excludedCategories: set of categories to HIDE. Empty = no filter (show all).
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set())
  const [isFilterOpen, setIsFilterOpen]             = useState(false)
  const filterRef                                   = useRef<HTMLDivElement>(null)

  // Unique categories present in the current data, sorted by count desc
  const categoryOptions: { cat: string; count: number }[] = (() => {
    const counts: Record<string, number> = {}
    for (const t of transactions) {
      const cat = t.category || 'Uncategorised'
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }))
  })()

  const isFiltered = excludedCategories.size > 0

  const displayTransactions = (isFiltered
    ? transactions.filter(t => !excludedCategories.has(t.category || 'Uncategorised'))
    : transactions
  ).slice().sort((a, b) => a.date.localeCompare(b.date))

  const toggleCategory = (cat: string) => {
    setExcludedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // Select all = remove all exclusions (show everything)
  const selectAll = () => setExcludedCategories(new Set())
  // Clear all = exclude every category (show nothing)
  const clearAll  = () => setExcludedCategories(new Set(categoryOptions.map(o => o.cat)))

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!isFilterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isFilterOpen])

  // ── Row category edit dropdown ─────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId,  setSavingId]  = useState<string | null>(null)
  const [savedId,   setSavedId]   = useState<string | null>(null)
  const [errorId,   setErrorId]   = useState<string | null>(null)
  const dropdownRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editingId) return
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [editingId])

  const handleCategorySelect = async (txnId: string, category: string) => {
    setEditingId(null)
    setSavingId(txnId)
    setErrorId(null)

    try {
      await updateTransactionCategory(txnId, category)
      setSavedId(txnId)
      setTimeout(
        () => setSavedId(prev => (prev === txnId ? null : prev)),
        2000
      )
    } catch {
      setErrorId(txnId)
      setTimeout(
        () => setErrorId(prev => (prev === txnId ? null : prev)),
        3000
      )
    } finally {
      setSavingId(null)
    }
  }

  if (transactions.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100">

      {/* ── Table header ── */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Transactions</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Click any category badge to correct it — corrections train future auto-categorisation
          </p>
        </div>
        <span className="shrink-0 text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
          {isFiltered
            ? `${displayTransactions.length} of ${transactions.length}`
            : `${transactions.length} transactions`}
        </span>
      </div>

      {/* ── Table ── */}
      {/* min-h ensures the container never collapses shorter than the filter dropdown.
          overflow-x-auto implicitly sets overflow-y:auto which clips absolutely-positioned
          children; without min-h the dropdown is invisible when tbody is empty. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                Date
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Description
              </th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                Amount
              </th>
              <th className="text-center px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                Type
              </th>

              {/* ── Category column header with filter ── */}
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                <div className="relative inline-block" ref={filterRef}>
                  <button
                    onClick={() => setIsFilterOpen(o => !o)}
                    className={`inline-flex items-center gap-1 transition-colors ${
                      isFiltered ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={isFiltered ? `${categoryOptions.length - excludedCategories.size} of ${categoryOptions.length} categories shown` : 'Filter by category'}
                  >
                    Category
                    {/* Funnel icon — filled when filter is active */}
                    {isFiltered ? (
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 01.707 1.707L13 9.414V17a1 1 0 01-1.447.894l-4-2A1 1 0 017 15V9.414L3.293 5.707A1 1 0 013 5V3z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                      </svg>
                    )}
                  </button>

                  {/* Filter dropdown */}
                  {isFilterOpen && (
                    <div className="absolute left-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 w-52">

                      {/* Select all / Clear actions */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                        <button
                          onClick={selectAll}
                          disabled={excludedCategories.size === 0}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                        >
                          Select all
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={clearAll}
                          disabled={excludedCategories.size === categoryOptions.length}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          Clear all
                        </button>
                      </div>

                      {/* Category checkboxes */}
                      <div className="max-h-60 overflow-y-auto py-1">
                        {categoryOptions.map(({ cat, count }) => {
                          const checked = !excludedCategories.has(cat)
                          return (
                            <label
                              key={cat}
                              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCategory(cat)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 accent-blue-600 cursor-pointer"
                              />
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getCategoryColor(cat) }}
                              />
                              <span className="flex-1 text-xs text-gray-700">{cat}</span>
                              <span className="text-xs text-gray-400 tabular-nums">{count}</span>
                            </label>
                          )
                        })}
                      </div>

                    </div>
                  )}
                </div>
              </th>

              <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                Confidence
              </th>
            </tr>
          </thead>

          <tbody>
            {displayTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center align-middle">
                  <p className="text-sm text-gray-400 mb-2">No transactions match the selected categories.</p>
                  <button
                    onClick={() => setExcludedCategories(new Set())}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear filter
                  </button>
                </td>
              </tr>
            )}
            {displayTransactions.map((txn, index) => {
              const isDebit    = txn.type === 'debit'
              const isSaving   = savingId === txn.transaction_id
              const isSaved    = savedId  === txn.transaction_id
              const isError    = errorId  === txn.transaction_id
              const isEditing  = editingId === txn.transaction_id
              const conf       = getConfidenceDisplay(txn.confidence)
              const catColor   = getCategoryColor(txn.category)
              const catLabel   = txn.category || 'Uncategorised'

              return (
                <tr
                  key={txn.transaction_id}
                  className={`border-b border-gray-50 transition-colors hover:bg-blue-50/20 ${index % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                >

                  {/* Date */}
                  <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(txn.date)}
                  </td>

                  {/* Description */}
                  <td className="px-5 py-3.5 max-w-xs">
                    <p className="text-sm text-gray-700 truncate" title={txn.description}>
                      {txn.description}
                    </p>
                  </td>

                  {/* Amount */}
                  <td className={`px-5 py-3.5 text-sm font-semibold text-right whitespace-nowrap tabular-nums ${isDebit ? 'text-red-500' : 'text-green-600'}`}>
                    {isDebit ? '−' : '+'}₹{formatAmount(txn.amount)}
                  </td>

                  {/* Type badge */}
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isDebit ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                      {isDebit ? 'Debit' : 'Credit'}
                    </span>
                  </td>

                  {/* Category — editable */}
                  <td className="px-5 py-3.5">
                    {isSaving ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                        Saving...
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white transition-opacity hover:opacity-80 cursor-pointer select-none"
                          style={{ backgroundColor: catColor }}
                          title="Click to change category"
                        >
                          {catLabel}
                          <svg
                            className={`w-3 h-3 flex-shrink-0 transition-transform ${isEditing ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isEditing && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[200px] max-h-64 overflow-y-auto">
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

                  {/* Confidence */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${conf.textClass}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dotClass}`} />
                      {conf.label}
                    </span>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}

export default TransactionTable
