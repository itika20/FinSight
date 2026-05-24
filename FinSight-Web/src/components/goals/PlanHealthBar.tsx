/** Live-updating health bar inside CreateGoalModal Phase B. */

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

// 0.3% tolerance for floating-point rounding from the ML pipeline.
// e.g. ₹49,864 covered on a ₹50,000 goal (₹136 gap = 0.27%) is close enough.
const COVERAGE_TOLERANCE = 0.997

interface PlanHealthBarProps {
  /** available_monthly_saving + sum of accepted decisions */
  covered: number
  /** required_monthly_saving (goal_amount / goal_months) */
  required: number
}

const PlanHealthBar = ({ covered, required }: PlanHealthBarProps) => {
  // Strict: used for the green "on track" badge
  const isOnTrack        = covered >= required
  // Within rounding tolerance: suppress gap warning and show near-full bar
  const isWithinTolerance = covered >= required * COVERAGE_TOLERANCE

  // Never show 100% fill when isOnTrack is false — that creates a contradiction.
  // Cap at 99% so the bar visually communicates a tiny remaining gap.
  const pct = isOnTrack
    ? 100
    : Math.min(99, Math.floor((covered / Math.max(required, 1)) * 100))

  const gap = Math.max(required - covered, 0)

  return (
    <div className={`rounded-xl px-4 py-3 mb-4 border transition-colors
      ${isOnTrack
        ? 'bg-green-50 border-green-200'
        : isWithinTolerance
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-800">
          Covered:{' '}
          <span className="text-gray-900">₹{fmt(covered)}</span>
          {' · '}
          Need:{' '}
          <span className="text-gray-900">₹{fmt(required)}</span>
        </p>
        {isOnTrack || isWithinTolerance ? (
          <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            Your plan is on track ✓
          </span>
        ) : (
          <span className="text-xs font-semibold text-gray-500">{pct}% covered</span>
        )}
      </div>

      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOnTrack || isWithinTolerance ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Only show gap warning for real shortfalls — not ML rounding artifacts */}
      {!isWithinTolerance && gap > 0 && (
        <p className="text-xs text-gray-500 mt-1.5">
          Accept more recommendations to close the gap (₹{fmt(gap)} short)
        </p>
      )}
    </div>
  )
}

export default PlanHealthBar
