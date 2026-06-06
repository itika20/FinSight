/**
 * AnalyticsPage — /analytics
 *
 * Six charts driven by the same month filter as the Dashboard.
 * Single-period charts (Donut, Top Categories, Daily, Drilldown) use the
 * salary-window-adjusted filteredTransactions for the selected month.
 * Trend charts (Monthly Trend, Savings vs Spending) use all transactions
 * so they can show movement across months.
 *
 * Layout:
 *   [Month filter tabs — same as Dashboard]
 *   Row 1 (2-col): Spending Donut | Top Categories bar
 *   Row 2 (full):  Monthly Spend Trend   (all months)
 *   Row 3 (full):  Savings vs Spending   (all months)
 *   Row 4 (full):  Day-by-day Spend      (selected month)
 *   Row 5 (full):  Category Drilldown    (selected month)
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransactions } from '../hooks/useTransactions'
import UserMenu from '../components/shared/UserMenu'
import ChartCard from '../components/analytics/ChartCard'
import SpendingDonutChart from '../components/analytics/SpendingDonutChart'
import TopCategoriesChart from '../components/analytics/TopCategoriesChart'
import MonthlyTrendChart from '../components/analytics/MonthlyTrendChart'
import SavingsVsSpendingChart from '../components/analytics/SavingsVsSpendingChart'
import DailySpendChart from '../components/analytics/DailySpendChart'
import CategoryDrilldownChart from '../components/analytics/CategoryDrilldownChart'
import CategoryTransactionsModal from '../components/analytics/CategoryTransactionsModal'

import {
  getCategoryTotals,
  getMonthlyTotals,
  getDailyTotals,
} from '../utils/analyticsData'

/** 'YYYY-MM' → 'Jan 2026' */
const fmtMonth = (ym: string): string => {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

// ─── component ─────────────────────────────────────────────────────────────────

const AnalyticsPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const {
    filteredTransactions,
    transactionsByMonth,
    selectedMonth,
    availableMonths,
    setSelectedMonth,
    isLoading,
  } = useTransactions()

  // ── Chart data for the selected month (salary-window-adjusted) ──
  const categoryTotals = useMemo(() => getCategoryTotals(filteredTransactions), [filteredTransactions])
  const dailyTotals    = useMemo(() => getDailyTotals(filteredTransactions),    [filteredTransactions])

  // ── Trend chart data — salary-window-adjusted per month ──────────
  // Each month's totals use the same transaction slice the dashboard shows
  // when that month tab is selected, so bars match the dashboard stat cards.
  const allMonthlyTotals = useMemo(() => getMonthlyTotals(transactionsByMonth), [transactionsByMonth])

  // ── Category drilldown modal ──────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const modalTransactions = useMemo(() => {
    if (!selectedCategory) return []
    return filteredTransactions.filter(
      t => (t.category || 'Uncategorised') === selectedCategory
    )
  }, [filteredTransactions, selectedCategory])

  const modalColor = useMemo(() => {
    if (!selectedCategory) return '#8B8B8B'
    return categoryTotals.find(c => c.category === selectedCategory)?.color ?? '#8B8B8B'
  }, [categoryTotals, selectedCategory])

  const noData         = filteredTransactions.length === 0
  const needMoreMonths = allMonthlyTotals.length < 2

  return (
    <>
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
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-400 mt-1">Understand your spending patterns at a glance.</p>
        </div>

        {/* Month filter tabs — identical to Dashboard */}
        {availableMonths.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-7">
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

        {/* ── Charts grid ── */}
        <div className="flex flex-col gap-6">

          {/* Row 1: Donut + Top Categories — selected month */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Where does my money go?"
              subtitle={selectedMonth ? `Spending split — ${fmtMonth(selectedMonth)}` : 'Spending split by category'}
              isLoading={isLoading}
              isEmpty={noData || categoryTotals.length === 0}
              emptyMessage="No spending data for this period."
              chartHeight={300}
            >
              <SpendingDonutChart
                data={categoryTotals}
                onCategoryClick={cat => setSelectedCategory(cat)}
              />
            </ChartCard>

            <ChartCard
              title="What drains me most?"
              subtitle={selectedMonth ? `Top 8 categories — ${fmtMonth(selectedMonth)}` : 'Top 8 categories by total spend'}
              isLoading={isLoading}
              isEmpty={noData || categoryTotals.length === 0}
              emptyMessage="No spending data for this period."
              chartHeight={300}
            >
              <TopCategoriesChart
                data={categoryTotals}
                onCategoryClick={cat => setSelectedCategory(cat)}
              />
            </ChartCard>
          </div>

          {/* Row 2: Monthly trend — all months */}
          <ChartCard
            title="Am I spending more than usual?"
            subtitle="Total spend per month — full history"
            isLoading={isLoading}
            isEmpty={allMonthlyTotals.length === 0 || needMoreMonths}
            emptyMessage="Upload statements spanning at least 2 months to see spending trends over time."
            chartHeight={280}
          >
            <MonthlyTrendChart data={allMonthlyTotals} />
          </ChartCard>

          {/* Row 3: Savings vs Spending — all months */}
          <ChartCard
            title="Saving vs spending"
            subtitle="Monthly income vs expenses — full history"
            isLoading={isLoading}
            isEmpty={allMonthlyTotals.length === 0 || needMoreMonths}
            emptyMessage="Upload statements spanning at least 2 months to compare savings and spending over time."
            chartHeight={280}
          >
            <SavingsVsSpendingChart data={allMonthlyTotals} />
          </ChartCard>

          {/* Row 4: Daily spend — selected month */}
          <ChartCard
            title="Day-by-day patterns"
            subtitle={selectedMonth ? `Daily spend — ${fmtMonth(selectedMonth)} (blue bar = highest day)` : 'Daily spend (blue bar = highest day)'}
            isLoading={isLoading}
            isEmpty={noData || dailyTotals.length === 0}
            emptyMessage="No spending data for this period."
            chartHeight={260}
          >
            <DailySpendChart data={dailyTotals} />
          </ChartCard>

          {/* Row 5: Category drilldown — selected month */}
          <ChartCard
            title="Within-category breakdown"
            subtitle={selectedMonth ? `Top merchants — ${fmtMonth(selectedMonth)}` : 'Top merchants / transactions inside a category'}
            isLoading={isLoading}
            isEmpty={noData || categoryTotals.length === 0}
            emptyMessage="No spending data for this period."
          >
            <CategoryDrilldownChart transactions={filteredTransactions} />
          </ChartCard>

        </div>
      </div>
    </div>

    {/* Category transactions modal — opened by clicking a donut slice */}
    {selectedCategory && (
      <CategoryTransactionsModal
        category={selectedCategory}
        color={modalColor}
        transactions={modalTransactions}
        onClose={() => setSelectedCategory(null)}
      />
    )}
  </>
  )
}

export default AnalyticsPage
