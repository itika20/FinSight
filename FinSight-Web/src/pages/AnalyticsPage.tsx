/**
 * AnalyticsPage — /analytics
 *
 * Six charts answering six spending questions, all controlled by a single
 * date range selector at the top.
 *
 * Layout:
 *   [Date range control]
 *   Row 1 (2-col): Spending Donut | Top Categories bar
 *   Row 2 (full):  Monthly Spend Trend
 *   Row 3 (full):  Savings vs Spending (dual area)
 *   Row 4 (full):  Day-by-day Spend (daily bar)
 *   Row 5 (full):  Category Drilldown (merchant bar)
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransactions } from '../hooks/useTransactions'
import UserMenu from '../components/shared/UserMenu'
import DateRangeControl from '../components/analytics/DateRangeControl'
import ChartCard from '../components/analytics/ChartCard'
import SpendingDonutChart from '../components/analytics/SpendingDonutChart'
import TopCategoriesChart from '../components/analytics/TopCategoriesChart'
import MonthlyTrendChart from '../components/analytics/MonthlyTrendChart'
import SavingsVsSpendingChart from '../components/analytics/SavingsVsSpendingChart'
import DailySpendChart from '../components/analytics/DailySpendChart'
import CategoryDrilldownChart from '../components/analytics/CategoryDrilldownChart'

import {
  type RangePreset,
  getPresetRange,
  filterByRange,
  getCategoryTotals,
  getMonthlyTotals,
  getDailyTotals,
} from '../utils/analyticsData'

// ─── component ─────────────────────────────────────────────────────────────────

const AnalyticsPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { transactions, isLoading } = useTransactions()

  // ── Date range state ────────────────────────────────────────────
  const [preset,     setPreset]     = useState<RangePreset>('3m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  // ── Filtered transactions ───────────────────────────────────────
  const { from, to } = useMemo(
    () => getPresetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )

  const filtered = useMemo(
    () => filterByRange(transactions, from, to),
    [transactions, from, to],
  )

  // ── Derived chart data ──────────────────────────────────────────
  const categoryTotals = useMemo(() => getCategoryTotals(filtered), [filtered])
  const monthlyTotals  = useMemo(() => getMonthlyTotals(filtered),  [filtered])
  const dailyTotals    = useMemo(() => getDailyTotals(filtered),     [filtered])

  const noData        = filtered.length === 0
  const needMoreMonths = monthlyTotals.length < 2

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
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/goals')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Goals
          </button>
          <UserMenu email={user?.email} onLogout={logout} />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-6 py-8 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-400 mt-1">Understand your spending patterns at a glance.</p>
        </div>

        {/* Date range control */}
        <div className="mb-8">
          <DateRangeControl
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onPresetChange={setPreset}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>

        {/* ── Charts grid ── */}
        <div className="flex flex-col gap-6">

          {/* Row 1: Donut + Top Categories (side by side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Where does my money go?"
              subtitle="Spending split by category"
              isLoading={isLoading}
              isEmpty={noData || categoryTotals.length === 0}
              emptyMessage="No spending data for this period."
              chartHeight={300}
            >
              <SpendingDonutChart data={categoryTotals} />
            </ChartCard>

            <ChartCard
              title="What drains me most?"
              subtitle="Top 8 categories by total spend"
              isLoading={isLoading}
              isEmpty={noData || categoryTotals.length === 0}
              emptyMessage="No spending data for this period."
              chartHeight={300}
            >
              <TopCategoriesChart data={categoryTotals} />
            </ChartCard>
          </div>

          {/* Row 2: Monthly trend */}
          <ChartCard
            title="Am I spending more than usual?"
            subtitle="Total spend per month"
            isLoading={isLoading}
            isEmpty={noData || needMoreMonths}
            emptyMessage="Upload statements spanning at least 2 months to see spending trends over time."
            chartHeight={280}
          >
            <MonthlyTrendChart data={monthlyTotals} />
          </ChartCard>

          {/* Row 3: Savings vs Spending */}
          <ChartCard
            title="Saving vs spending"
            subtitle="Monthly income/credits vs expenses/debits"
            isLoading={isLoading}
            isEmpty={noData || needMoreMonths}
            emptyMessage="Upload statements spanning at least 2 months to compare savings and spending over time."
            chartHeight={280}
          >
            <SavingsVsSpendingChart data={monthlyTotals} />
          </ChartCard>

          {/* Row 4: Daily spend */}
          <ChartCard
            title="Day-by-day patterns"
            subtitle="Daily spend within the selected period (blue bar = highest day)"
            isLoading={isLoading}
            isEmpty={noData || dailyTotals.length === 0}
            emptyMessage="No spending data for this period."
            chartHeight={260}
          >
            <DailySpendChart data={dailyTotals} />
          </ChartCard>

          {/* Row 5: Category drilldown */}
          <ChartCard
            title="Within-category breakdown"
            subtitle="Top merchants / transactions inside a category"
            isLoading={isLoading}
            isEmpty={noData || categoryTotals.length === 0}
            emptyMessage="No spending data for this period."
          >
            <CategoryDrilldownChart transactions={filtered} />
          </ChartCard>

        </div>
      </div>
    </div>
  )
}

export default AnalyticsPage
