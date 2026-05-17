/**
 * Single recommendation card used inside CreateGoalModal Phase B.
 *
 * Key UX rules (from spec):
 *   - Cards START in "Accepted" state. User opts OUT by clicking "Skip this".
 *   - "Customize amount" expands inline — no new modal / screen.
 *   - Skipped cards are faded (opacity-50) with a "Restore" button.
 */

import { useState } from 'react'
import type { CategoryCutback, RecommendationDecision } from '../../models/goals'
import { CATEGORY_COLORS } from '../../constants/config'

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

interface RecommendationCardProps {
  rec: CategoryCutback
  decision: RecommendationDecision
  onDecision: (category: string, decision: RecommendationDecision) => void
}

const RecommendationCard = ({ rec, decision, onDecision }: RecommendationCardProps) => {
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [customAmount,  setCustomAmount]  = useState('')

  const isSkipped    = decision.status === 'skipped'
  const isCustomised = decision.status === 'modified'

  const overspendPct = rec.peer_avg_monthly_spend > 0
    ? Math.round(((rec.current_monthly_spend - rec.peer_avg_monthly_spend) / rec.peer_avg_monthly_spend) * 100)
    : 0

  const targetSpend = rec.current_monthly_spend - decision.amount
  const categoryColor = CATEGORY_COLORS[rec.category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'

  const handleSkip = () => {
    onDecision(rec.category, { status: 'skipped', amount: 0 })
    setIsCustomizing(false)
  }

  const handleRestore = () => {
    onDecision(rec.category, { status: 'accepted', amount: rec.monthly_saving })
    setIsCustomizing(false)
  }

  const startCustomize = () => {
    setCustomAmount(decision.amount.toFixed(0))
    setIsCustomizing(true)
  }

  const confirmCustomize = () => {
    const val = parseFloat(customAmount)
    if (isNaN(val) || val < 0) return
    const clamped = Math.min(Math.max(val, 0), rec.monthly_saving)
    onDecision(rec.category, {
      status: clamped === rec.monthly_saving ? 'accepted' : 'modified',
      amount: clamped,
    })
    setIsCustomizing(false)
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 transition-all ${isSkipped ? 'opacity-50' : ''}`}>
      {/* ── Header row ─────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {/* Category colour dot */}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
            style={{ backgroundColor: categoryColor }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{rec.category}</span>
              {/* Status badge */}
              {isSkipped ? (
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Skipped
                </span>
              ) : isCustomised ? (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  ✓ Customised
                </span>
              ) : (
                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  ✓ Accepted
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Currently ₹{fmt(rec.current_monthly_spend)}/mo
              {' → '}
              Target ₹{fmt(targetSpend)}/mo
            </p>
            {!isSkipped && (
              <p className="text-xs text-gray-400 mt-0.5">
                Saves ₹{fmt(decision.amount)}/mo
                {overspendPct > 0 && ` · You spend ${overspendPct}% more than peers`}
              </p>
            )}
          </div>
        </div>

        {/* Saving badge (right) */}
        {!isSkipped && (
          <div className="flex-shrink-0 text-right">
            <p className="text-base font-bold text-green-600">₹{fmt(decision.amount)}/mo</p>
          </div>
        )}
      </div>

      {/* ── Customize inline expansion ──────────── */}
      {isCustomizing && !isSkipped && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">
            How much to cut? (max ₹{fmt(rec.monthly_saving)}/mo)
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">₹</span>
              <input
                type="number"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                min="0"
                max={rec.monthly_saving}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-blue-300 text-sm bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmCustomize() }}
              />
            </div>
            <button
              onClick={confirmCustomize}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => setIsCustomizing(false)}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Action row ──────────────────────────── */}
      {!isCustomizing && (
        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-3">
          {isSkipped ? (
            <button
              onClick={handleRestore}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                onClick={startCustomize}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                Customize amount
              </button>
              <button
                onClick={handleSkip}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                Skip this
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default RecommendationCard
