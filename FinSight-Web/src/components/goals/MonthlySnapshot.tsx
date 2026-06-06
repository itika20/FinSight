/** Informational card shown at the top of the Goals Hub. */

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

interface MonthlySnapshotProps {
  monthlyIncome: number
  avgMonthlySpend: number
  currentSaving: number
  totalRequired: number
}

const MonthlySnapshot = ({ monthlyIncome, avgMonthlySpend, currentSaving, totalRequired }: MonthlySnapshotProps) => {
  const committed = Math.min(totalRequired, currentSaving)
  const available = Math.max(currentSaving - totalRequired, 0)

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-6">
      <p className="text-sm font-semibold text-blue-900">
        Your monthly income{' '}
        <span className="font-bold">₹{fmt(monthlyIncome)}</span>
        {' '}minus expenses{' '}
        <span className="font-bold">₹{fmt(avgMonthlySpend)}</span>
        {' '}gives you an opportunity to save{' '}
        <span className="font-bold text-blue-700">₹{fmt(currentSaving)}/month</span>
      </p>
      <p className="text-xs text-blue-600 mt-1.5">
        ₹{fmt(committed)} committed to existing goals
        {' · '}
        ₹{fmt(available)} free
      </p>
    </div>
  )
}

export default MonthlySnapshot
