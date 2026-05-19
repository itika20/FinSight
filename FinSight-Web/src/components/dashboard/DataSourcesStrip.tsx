/**
 * DataSourcesStrip — compact always-visible strip below stat cards.
 *
 * Shows: "Based on N statements · Jan 2024 → May 2026  [Manage]"
 * Hidden when statement_count is 0.
 */

interface DataSourcesStripProps {
  statementCount: number
  dateFrom: string | null   // YYYY-MM-DD
  dateTo: string | null     // YYYY-MM-DD
  onManageClick: () => void
}

/** Format 'YYYY-MM-DD' → 'Jan 2026' */
const fmtMonthYear = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

const DataSourcesStrip = ({ statementCount, dateFrom, dateTo, onManageClick }: DataSourcesStripProps) => {
  if (statementCount === 0) return null

  const range = dateFrom && dateTo
    ? `${fmtMonthYear(dateFrom)} → ${fmtMonthYear(dateTo)}`
    : null

  return (
    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl py-3 px-5">
      {/* Left — data provenance */}
      <div className="flex items-center gap-3">
        {/* FileText icon */}
        <svg
          className="w-5 h-5 text-slate-500 flex-shrink-0"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 12h6m-6 4h6M5 8h.01M5 12h.01M5 16h.01M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"
          />
        </svg>

        <p className="text-sm text-slate-600">
          Based on{' '}
          <span className="font-semibold text-slate-900">
            {statementCount} {statementCount === 1 ? 'statement' : 'statements'}
          </span>
          {range && (
            <>
              {' · '}
              <span>{range}</span>
            </>
          )}
        </p>
      </div>

      {/* Right — manage action */}
      <button
        onClick={onManageClick}
        className="text-sm font-medium text-blue-600 hover:underline ml-4 flex-shrink-0"
      >
        Manage
      </button>
    </div>
  )
}

export default DataSourcesStrip
