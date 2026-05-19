/**
 * CategoryDrilldownChart — "Within-category breakdown"
 *
 * User picks a category; chart shows top 10 merchants by spend.
 * Merchant names are resolved via the backend (OpenAI GPT-4o-mini) so that
 * e.g. "ZOMATO ORDER#99101" and "ZOMATO ORDER#98234" both group as "Zomato".
 *
 * Normalization results are cached in a module-level map so switching categories
 * back and forth does not re-call the API for already-seen descriptions.
 */

import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import type { Transaction } from '../../models'
import { getCategoryTotals, getMerchantTotals, fmtRupee } from '../../utils/analyticsData'
import { normalizeMerchantsApi } from '../../api/upload'

interface Props {
  transactions: Transaction[]
}

// Module-level cache: raw description → clean merchant name.
// Persists across renders and category changes for the lifetime of the page.
const nameCache: Record<string, string> = {}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-sm">
      <p className="font-medium text-gray-800 mb-1 max-w-[220px] break-words">{label}</p>
      <p className="text-gray-600">{fmtRupee(d.amount)}</p>
      <p className="text-gray-400 text-xs">{d.percentage.toFixed(1)}% of category</p>
    </div>
  )
}

const CategoryDrilldownChart = ({ transactions }: Props) => {
  const categories = getCategoryTotals(transactions).map(c => c.category)
  const [selected,    setSelected]    = useState<string>(categories[0] ?? '')
  const [nameMap,     setNameMap]     = useState<Record<string, string>>(nameCache)
  const [isFetching,  setIsFetching]  = useState(false)
  const pendingRef = useRef<string>('')    // tracks which category is in-flight

  // When category changes, fetch normalized names for any unseen descriptions
  useEffect(() => {
    if (!selected) return

    const categoryTransactions = transactions.filter(
      t => t.type === 'debit' && (t.category || 'Uncategorised') === selected
    )
    const unseen = [
      ...new Set(categoryTransactions.map(t => t.description))
    ].filter(d => !(d in nameCache))

    if (unseen.length === 0) {
      // All descriptions already cached — render immediately
      setNameMap({ ...nameCache })
      return
    }

    pendingRef.current = selected
    setIsFetching(true)

    normalizeMerchantsApi(unseen)
      .then(result => {
        Object.assign(nameCache, result)
        if (pendingRef.current === selected) {
          setNameMap({ ...nameCache })
        }
      })
      .catch(() => {
        // On error, fall back to cached + raw names — chart still renders
        if (pendingRef.current === selected) {
          setNameMap({ ...nameCache })
        }
      })
      .finally(() => {
        if (pendingRef.current === selected) setIsFetching(false)
      })
  }, [selected, transactions])

  const merchants = selected ? getMerchantTotals(transactions, selected, nameMap) : []

  return (
    <div>
      {/* Category selector */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {isFetching && (
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Resolving merchants…
          </span>
        )}
      </div>

      {merchants.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          No transactions in this category for the period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, merchants.length * 36)}>
          <BarChart
            data={merchants}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={v => fmtRupee(v)}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="description"
              width={140}
              tick={{ fontSize: 11, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20} fill="#818cf8">
              {merchants.map((_, i) => (
                <Cell
                  key={i}
                  fill={`hsl(${240 - i * 12}, 60%, ${65 - i * 3}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default CategoryDrilldownChart
