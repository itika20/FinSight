/**
 * ChartCard — reusable white card wrapper for every analytics chart.
 * Handles loading skeleton, empty state, and the chart title/subtitle.
 */

import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  /** Height of the chart area (px). Default 300. */
  chartHeight?: number
  children: ReactNode
}

const ChartCard = ({
  title,
  subtitle,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data for this period.',
  chartHeight = 300,
  children,
}: ChartCardProps) => (
  <div className="bg-white rounded-xl border border-gray-100 p-6">
    {/* Header */}
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>

    {/* Loading skeleton */}
    {isLoading && (
      <div
        className="w-full rounded-lg bg-gray-100 animate-pulse"
        style={{ height: chartHeight }}
      />
    )}

    {/* Empty / insufficient data */}
    {!isLoading && isEmpty && (
      <div
        className="flex flex-col items-center justify-center gap-2 text-center"
        style={{ height: chartHeight }}
      >
        <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm text-gray-400 max-w-xs">{emptyMessage}</p>
      </div>
    )}

    {/* Chart content */}
    {!isLoading && !isEmpty && children}
  </div>
)

export default ChartCard
