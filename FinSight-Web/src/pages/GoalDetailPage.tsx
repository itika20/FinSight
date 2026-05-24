/**
 * GoalDetailPage — Screen 3 of the Goals feature (/goals/:id).
 *
 * Read-only view of a single saved goal.
 * Fetches all goals via listGoalsApi() and finds the one matching the URL id.
 *
 * Shows:
 *   - Goal name, target amount, status badge
 *   - Required monthly saving, target date
 *   - Progress bar: teal = existing savings (toggle-gated), green = tagged investments
 *   - Monthly surplus available for investment
 *   - Record Investment form (add/delete tagged investments)
 *   - Monthly investment breakdown timeline
 *   - Actual vs Plan card
 *   - Spending plan decisions table
 *   - [Adjust this plan] opens CreateGoalModal pre-filled
 *   - [Delete goal] deletes and navigates back
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  listGoalsApi,
  deleteGoalApi,
  toggleExistingSavingsApi,
  recalculateSavingsApi,
  addGoalInvestmentApi,
  deleteGoalInvestmentApi,
} from '../api/goals'
import type { SavedGoal, SavedGoalListResponse, RecommendationDecision } from '../models/goals'
import CreateGoalModal from '../components/goals/CreateGoalModal'
import { GOAL_STATUS_LABELS, GOAL_STATUS_BADGE, CATEGORY_COLORS } from '../constants/config'
import UserMenu from '../components/shared/UserMenu'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const toIndianDisplay = (val: string) => {
  const digits = val.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('en-IN')
}

const targetDateLabel = (months: number, createdAt: string): string => {
  const d = new Date(createdAt)
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const planAgeMonths = (createdAt: string): number => {
  const created = new Date(createdAt)
  const now = new Date()
  return (now.getFullYear() - created.getFullYear()) * 12
       + (now.getMonth() - created.getMonth())
}

const statusLabel = (d: RecommendationDecision): string => {
  if (d.status === 'skipped')  return 'Skipped'
  if (d.status === 'modified') return 'Customised'
  return 'Accepted'
}

const statusDotClass = (d: RecommendationDecision): string => {
  if (d.status === 'skipped')  return 'text-gray-400'
  if (d.status === 'modified') return 'text-blue-600'
  return 'text-green-600'
}

// ─── component ─────────────────────────────────────────────────────────────────
const GoalDetailPage = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [listData,          setListData]          = useState<SavedGoalListResponse | null>(null)
  const [goal,              setGoal]              = useState<SavedGoal | null>(null)
  const [allGoals,          setAllGoals]          = useState<SavedGoal[]>([])
  const [isLoading,         setIsLoading]         = useState(true)
  const [loadError,         setLoadError]         = useState<string | null>(null)
  const [isDeleting,        setIsDeleting]        = useState(false)
  const [isModalOpen,       setIsModalOpen]       = useState(false)
  const [isToggling,        setIsToggling]        = useState(false)
  const [isRecalculating,   setIsRecalculating]   = useState(false)
  const [isBreakdownOpen,   setIsBreakdownOpen]   = useState(false)

  // ── Investment form state ──────────────────────────────────────
  const [showInvestForm,    setShowInvestForm]    = useState(false)
  const [investAmount,      setInvestAmount]      = useState('')
  const [investDate,        setInvestDate]        = useState(new Date().toISOString().slice(0, 10))
  const [investNote,        setInvestNote]        = useState('')
  const [isAddingInv,       setIsAddingInv]       = useState(false)
  const [invError,          setInvError]          = useState<string | null>(null)
  const [deletingInvId,     setDeletingInvId]     = useState<string | null>(null)

  const loadGoals = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await listGoalsApi()
      setListData(data)
      setAllGoals(data.goals)
      const found = data.goals.find(g => g.id === id)
      if (!found) {
        setLoadError('Goal not found.')
      } else {
        setGoal(found)
      }
    } catch {
      setLoadError('Could not load goal details. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadGoals() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleExistingSavings = async () => {
    if (!goal || isToggling) return
    const next = !goal.count_existing_savings
    setIsToggling(true)
    setGoal(g => g ? { ...g, count_existing_savings: next } : g)
    try {
      await toggleExistingSavingsApi(goal.id, next)
      const data = await listGoalsApi()
      setListData(data)
      setAllGoals(data.goals)
      const updated = data.goals.find(g => g.id === id)
      if (updated) setGoal(updated)
    } catch {
      setGoal(g => g ? { ...g, count_existing_savings: !next } : g)
      setLoadError('Could not save preference. Please try again.')
    } finally {
      setIsToggling(false)
    }
  }

  const handleRecalculate = async () => {
    if (!goal || isRecalculating) return
    setIsRecalculating(true)
    setLoadError(null)
    try {
      const result = await recalculateSavingsApi(goal.id)
      setGoal(g => g
        ? { ...g, accumulated_savings_at_creation: result.accumulated_savings_at_creation }
        : g
      )
    } catch {
      setLoadError('Could not recalculate savings. Please try again.')
    } finally {
      setIsRecalculating(false)
    }
  }

  const handleAddInvestment = async () => {
    if (!goal) return
    const amount = parseFloat(investAmount.replace(/,/g, ''))
    if (isNaN(amount) || amount <= 0) {
      setInvError('Enter a valid amount greater than ₹0.')
      return
    }
    setIsAddingInv(true)
    setInvError(null)
    try {
      await addGoalInvestmentApi(goal.id, {
        amount,
        date: investDate,
        note: investNote.trim() || undefined,
      })
      // Refetch to get updated totals from backend
      const data = await listGoalsApi()
      setListData(data)
      setAllGoals(data.goals)
      const updated = data.goals.find(g => g.id === id)
      if (updated) setGoal(updated)
      setShowInvestForm(false)
      setInvestAmount('')
      setInvestNote('')
      setInvestDate(new Date().toISOString().slice(0, 10))
    } catch {
      setInvError('Could not record investment. Please try again.')
    } finally {
      setIsAddingInv(false)
    }
  }

  const handleDeleteInvestment = async (invId: string) => {
    if (!goal) return
    setDeletingInvId(invId)
    try {
      await deleteGoalInvestmentApi(goal.id, invId)
      const data = await listGoalsApi()
      setListData(data)
      setAllGoals(data.goals)
      const updated = data.goals.find(g => g.id === id)
      if (updated) setGoal(updated)
    } catch {
      setLoadError('Could not remove investment. Please try again.')
    } finally {
      setDeletingInvId(null)
    }
  }

  const handleDelete = async () => {
    if (!goal) return
    if (!window.confirm(`Delete "${goal.goal_name}"? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteGoalApi(goal.id)
      navigate('/goals')
    } catch {
      setLoadError('Could not delete the goal. Please try again.')
      setIsDeleting(false)
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onAnalytics={() => navigate('/analytics')} onLogout={logout} />
        <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/4 mb-6" />
          <div className="h-8 bg-gray-200 rounded w-2/3 mb-3" />
          <div className="h-4 bg-gray-100 rounded w-1/2 mb-8" />
          <div className="h-2 bg-gray-200 rounded-full w-full mb-8" />
          <div className="h-48 bg-white rounded-xl border border-gray-100" />
        </div>
      </div>
    )
  }

  // ── Error / not found ──────────────────────────────────────────
  if (loadError || !goal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onAnalytics={() => navigate('/analytics')} onLogout={logout} />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-6 text-center">
            <p className="text-sm text-red-700 font-medium mb-3">{loadError ?? 'Goal not found.'}</p>
            <button
              onClick={() => navigate('/goals')}
              className="text-sm text-blue-600 font-medium hover:underline"
            >
              ← Back to Goals
            </button>
          </div>
        </div>
      </div>
    )
  }

  const badge = GOAL_STATUS_BADGE[goal.status] ?? 'bg-gray-100 text-gray-600'
  const label = GOAL_STATUS_LABELS[goal.status] ?? goal.status

  // Decisions as sorted array (non-skipped first)
  const decisionEntries = Object.entries(goal.decisions).sort(([, a], [, b]) => {
    if (a.status === 'skipped' && b.status !== 'skipped') return 1
    if (a.status !== 'skipped' && b.status === 'skipped') return -1
    return b.amount - a.amount
  })

  const totalCutback = Object.values(goal.decisions)
    .filter(d => d.status !== 'skipped')
    .reduce((s, d) => s + d.amount, 0)

  // ── Investment progress computations ───────────────────────────
  const taggedTotal    = goal.total_tagged_investment ?? 0
  const existingContrib = goal.count_existing_savings ? goal.accumulated_savings_at_creation : 0
  const combinedSaved  = existingContrib + taggedTotal
  const combinedPct    = Math.min((combinedSaved / goal.goal_amount) * 100, 100)
  const existingSegPct = Math.min((existingContrib / goal.goal_amount) * 100, 100)
  const taggedSegPct   = Math.min((taggedTotal / goal.goal_amount) * 100, 100 - existingSegPct)

  // Monthly pace of tagged investments
  const ageMonths      = Math.max(1, planAgeMonths(goal.created_at))
  const avgMonthly     = taggedTotal / ageMonths
  const investStatus   = avgMonthly >= goal.required_monthly_saving        ? 'ahead'
                       : avgMonthly >= goal.required_monthly_saving * 0.8  ? 'on_track'
                       : 'behind'

  // Projection: how many more months to reach goal at current tagged pace
  const remainingAmt   = Math.max(0, goal.goal_amount - combinedSaved)
  const projMonths     = avgMonthly > 0 ? Math.ceil(remainingAmt / avgMonthly) : null

  // Monthly surplus available (from list response)
  const monthlySurplus = listData
    ? Math.max(0, (listData.monthly_income_estimate ?? 0) - (listData.avg_monthly_spend ?? 0))
    : 0

  // Group tagged investments by month for the breakdown timeline
  const investByMonth: Record<string, number> = {}
  for (const inv of goal.tagged_investments ?? []) {
    const m = inv.date.slice(0, 7)
    investByMonth[m] = (investByMonth[m] ?? 0) + inv.amount
  }
  const investMonths = Object.entries(investByMonth)
    .sort(([a], [b]) => b.localeCompare(a))  // newest first

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onAnalytics={() => navigate('/analytics')} onLogout={logout} />

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Back link */}
        <button
          onClick={() => navigate('/goals')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Goals
        </button>

        {/* ── Goal header ── */}
        <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-2xl font-bold text-gray-900">{goal.goal_name}</h2>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
              {label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            ₹{fmt(goal.goal_amount)} by {targetDateLabel(goal.goal_months, goal.created_at)}
            {' · '}₹{fmt(goal.required_monthly_saving)}/month needed
          </p>

          {/* ── Progress bar (existing savings toggle + tagged investments) ── */}
          {(() => {
            const blockingGoal   = allGoals.find(g => g.id !== goal.id && g.count_existing_savings)
            const needsRecalc    = goal.accumulated_savings_at_creation === 0
            const toggleDisabled = isToggling || !!blockingGoal

            return (
              <div>
                {/* Count existing savings toggle */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium">Count existing savings</span>
                    {goal.accumulated_savings_at_creation > 0 && (
                      <span className="text-xs text-gray-400">
                        (₹{fmt(goal.accumulated_savings_at_creation)} saved so far)
                      </span>
                    )}
                    {needsRecalc && (
                      <button
                        onClick={handleRecalculate}
                        disabled={isRecalculating}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
                      >
                        {isRecalculating ? 'Checking…' : 'Check savings →'}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleToggleExistingSavings}
                    disabled={toggleDisabled || needsRecalc}
                    title={
                      blockingGoal
                        ? `Already counting in "${blockingGoal.goal_name}" — turn it off there first`
                        : needsRecalc
                          ? 'Click "Check savings →" first'
                          : goal.count_existing_savings
                            ? 'Exclude existing savings'
                            : 'Count existing savings toward this goal'
                    }
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                      goal.count_existing_savings ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      goal.count_existing_savings ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {blockingGoal && (
                  <p className="text-xs text-amber-600 mb-2">
                    Existing savings are already counted in "{blockingGoal.goal_name}". Turn it off there to apply here.
                  </p>
                )}

                {/* Progress numbers */}
                <div className="flex items-center justify-between mt-3 mb-1.5">
                  <span className="text-xs text-gray-400">
                    ₹{fmt(combinedSaved)} saved of ₹{fmt(goal.goal_amount)}
                  </span>
                  <span className="text-xs font-semibold text-gray-700">
                    {combinedPct.toFixed(1)}%
                  </span>
                </div>

                {/* Stacked two-segment bar */}
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-2">
                  {existingSegPct > 0 && (
                    <div
                      className="h-full flex-shrink-0 transition-all duration-500"
                      style={{ width: `${existingSegPct}%`, backgroundColor: '#14b8a6' }}
                    />
                  )}
                  {taggedSegPct > 0 && (
                    <div
                      className="h-full flex-shrink-0 transition-all duration-500"
                      style={{ width: `${taggedSegPct}%`, backgroundColor: '#10b981' }}
                    />
                  )}
                </div>

                {/* Legend */}
                {(existingSegPct > 0 || taggedSegPct > 0) && (
                  <div className="flex items-center gap-4 mb-1">
                    {existingSegPct > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#14b8a6' }} />
                        <span className="text-xs text-gray-400">Existing ₹{fmt(existingContrib)}</span>
                      </div>
                    )}
                    {taggedSegPct > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#10b981' }} />
                        <span className="text-xs text-gray-400">Invested ₹{fmt(taggedTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Savings Progress card (pace + projection) ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Savings Progress</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              investStatus === 'ahead'    ? 'bg-green-100 text-green-800' :
              investStatus === 'on_track' ? 'bg-blue-100 text-blue-800'  :
                                            'bg-amber-100 text-amber-800'
            }`}>
              {investStatus === 'ahead' ? 'Ahead' : investStatus === 'on_track' ? 'On track' : 'Behind'}
            </span>
          </div>

          {taggedTotal === 0 ? (
            <p className="text-xs text-gray-400 mb-4">
              No investments recorded yet. Use the button below to log your first contribution toward this goal.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                ₹{fmt(taggedTotal)} invested since goal creation
                {' · '}avg ₹{fmt(Math.round(avgMonthly))}/month
              </p>

              {/* Projection */}
              {projMonths !== null && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-gray-600">
                    At your current pace of{' '}
                    <span className="font-semibold">₹{fmt(Math.round(avgMonthly))}/month</span>,
                    you'll reach this goal in{' '}
                    <span className="font-semibold">~{projMonths} months</span>
                    {projMonths <= goal.goal_months
                      ? ' — on schedule'
                      : ` — ${projMonths - goal.goal_months} months behind schedule`}
                  </p>
                </div>
              )}

              {/* Monthly breakdown */}
              <button
                onClick={() => setIsBreakdownOpen(o => !o)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors mb-1"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${isBreakdownOpen ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Monthly breakdown
              </button>

              {isBreakdownOpen && investMonths.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {investMonths.map(([month, amount]) => {
                    const onPace = amount >= goal.required_monthly_saving * 0.8
                    return (
                      <div key={month} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${onPace ? 'bg-green-500' : 'bg-amber-400'}`} />
                          <span className="text-xs font-medium text-gray-600">
                            {new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-800">₹{fmt(amount)}</p>
                          <p className="text-xs text-gray-400">of ₹{fmt(goal.required_monthly_saving)} target</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Monthly surplus hint ── */}
          {monthlySurplus > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">
                  ₹{fmt(Math.round(monthlySurplus))}<span className="text-gray-400 font-normal">/month available surplus</span>
                </p>
                <p className="text-xs text-gray-400">Add this toward your goal each cycle to stay on track</p>
              </div>
            </div>
          )}

          {/* ── Record Investment button / form ── */}
          <div className="mt-4">
            {!showInvestForm ? (
              <button
                onClick={() => setShowInvestForm(true)}
                className="w-full py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Record investment toward this goal
              </button>
            ) : (
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-green-800">Record an investment</p>

                <div className="flex gap-3">
                  {/* Amount */}
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={investAmount}
                        onChange={e => setInvestAmount(toIndianDisplay(e.target.value))}
                        placeholder="e.g. 10,000"
                        className="w-full pl-7 pr-3 py-2 rounded-lg border border-green-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                      />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Date</label>
                    <input
                      type="date"
                      value={investDate}
                      onChange={e => setInvestDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-green-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                    />
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Note (optional)</label>
                  <input
                    type="text"
                    value={investNote}
                    onChange={e => setInvestNote(e.target.value)}
                    placeholder="e.g. FD, SIP, savings account transfer…"
                    className="w-full px-3 py-2 rounded-lg border border-green-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  />
                </div>

                {invError && (
                  <p className="text-xs text-red-600">{invError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleAddInvestment}
                    disabled={isAddingInv || !investAmount}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isAddingInv ? 'Saving…' : 'Save investment'}
                  </button>
                  <button
                    onClick={() => { setShowInvestForm(false); setInvError(null); setInvestAmount(''); setInvestNote('') }}
                    className="px-4 py-2 text-gray-500 text-xs font-medium hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Investment history list ── */}
          {(goal.tagged_investments ?? []).length > 0 && (
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500 mb-1">Investment history</p>
              {[...(goal.tagged_investments ?? [])].reverse().map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800">₹{fmt(inv.amount)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {inv.note ? ` · ${inv.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteInvestment(inv.id)}
                    disabled={deletingInvId === inv.id}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 ml-3 flex-shrink-0"
                    title="Remove this investment"
                  >
                    {deletingInvId === inv.id ? '…' : '×'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Actual vs Plan card ── */}
        {(() => {
          if (!goal.current_month) return null

          const goalCreationMonth = goal.created_at.slice(0, 7)

          // Guard: data is from before goal was created
          if (goal.current_month < goalCreationMonth) {
            const firstMonth = new Date(goal.created_at)
            firstMonth.setMonth(firstMonth.getMonth() + 1)
            const firstLabel = firstMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
            return (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs text-blue-700">
                  Actual vs Plan data will appear starting {firstLabel} — your first full month on this goal.
                </p>
              </div>
            )
          }

          // Eligible = non-skipped decisions that have a stored baseline
          const eligible = decisionEntries.filter(([cat, dec]) => {
            if (dec.status === 'skipped') return false
            return (goal.baselines[cat] ?? 0) > 0
          })

          const monthLabel = new Date(goal.current_month + '-01').toLocaleDateString('en-IN', {
            month: 'long', year: 'numeric'
          })

          if (eligible.length === 0) return (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-blue-700">
                Actual vs plan tracking is available for goals created after spending baselines
                were introduced. Adjust this plan to enable per-category tracking.
              </p>
            </div>
          )

          const withData = eligible.filter(([cat]) =>
            goal.current_month_spend?.[cat] !== undefined
          )

          if (withData.length === 0) return (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-blue-700">
                No spend data for {monthLabel} yet — upload this month's statement to see
                how your actual spend compares to the plan.
              </p>
            </div>
          )

          const overCount  = withData.filter(([cat, dec]) => {
            const target = (goal.baselines[cat] ?? 0) - dec.amount
            return (goal.current_month_spend![cat] ?? 0) > target
          }).length
          const underCount = withData.length - overCount

          return (
            <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Actual vs Plan</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{monthLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  {underCount > 0 && (
                    <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                      {underCount} on track
                    </span>
                  )}
                  {overCount > 0 && (
                    <span className="text-xs font-medium bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                      {overCount} over budget
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {withData.map(([category, dec]) => {
                  const color     = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'
                  const baseline  = goal.baselines[category] ?? 0
                  const target    = Math.max(0, baseline - dec.amount)
                  const actual    = goal.current_month_spend![category]
                  const isOver    = actual > target
                  const variance  = actual - target
                  const maxVal    = Math.max(actual, target, 1)
                  const targetPct = (target / maxVal) * 100
                  const actualPct = (actual / maxVal) * 100

                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-sm font-medium text-gray-800 truncate">{category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0 ml-3">
                          <span className="text-gray-400">Plan ₹{fmt(target)}</span>
                          <span className={`font-semibold ${isOver ? 'text-red-600' : 'text-green-700'}`}>
                            Actual ₹{fmt(actual)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${
                            isOver
                              ? 'bg-red-50 text-red-600 border border-red-100'
                              : 'bg-green-50 text-green-700 border border-green-100'
                          }`}>
                            {isOver ? '+' : '−'}₹{fmt(Math.abs(variance))}
                          </span>
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full overflow-hidden bg-gray-100">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                          style={{ width: `${actualPct}%`, backgroundColor: isOver ? '#f87171' : '#4ade80' }}
                        />
                        {isOver && (
                          <div
                            className="absolute top-0 h-full w-px bg-gray-500 opacity-70"
                            style={{ left: `${targetPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Plan summary card ── */}
        <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-700">Your spending plan</h3>
            <div className="text-right">
              <p className="text-sm font-bold text-green-600">₹{fmt(totalCutback)}/mo total cutback</p>
              {goal.current_month && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Actual data: {new Date(goal.current_month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Spending coverage % (Q5) */}
          {totalCutback > 0 && goal.required_monthly_saving > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              Spending adjustments cover{' '}
              <span className="font-medium text-gray-600">
                {Math.round((totalCutback / goal.required_monthly_saving) * 100)}%
              </span>{' '}
              of your ₹{fmt(goal.required_monthly_saving)}/month target
            </p>
          )}

          {/* Staleness notice */}
          {(() => {
            const age = planAgeMonths(goal.created_at)
            if (age < 3) return null
            const isStale = age >= 6
            return (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 mb-3 ${
                isStale ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100'
              }`}>
                <svg
                  className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isStale ? 'text-amber-500' : 'text-gray-400'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={`text-xs leading-relaxed ${isStale ? 'text-amber-700' : 'text-gray-500'}`}>
                  Plan created {age} month{age !== 1 ? 's' : ''} ago
                  {isStale
                    ? ' — your spending patterns may have shifted significantly. Consider adjusting this plan.'
                    : ' — targets may be slightly out of date.'}
                </p>
              </div>
            )
          })()}

          {decisionEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No cutbacks in this plan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50">
              {decisionEntries.map(([category, dec]) => {
                const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'
                const isSkipped = dec.status === 'skipped'
                return (
                  <div key={category} className={`py-2.5 ${isSkipped ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-gray-800 truncate">{category}</span>
                        {(() => {
                          const drift = goal.spend_drift?.find(d => d.category === category)
                          if (!drift) return null
                          const up = drift.drift_pct > 0
                          return (
                            <span
                              className={`text-xs font-medium flex-shrink-0 ${up ? 'text-red-500' : 'text-green-600'}`}
                              title={`Spending ${up ? 'up' : 'down'} ${Math.abs(drift.drift_pct).toFixed(0)}% vs plan creation (₹${fmt(drift.plan_baseline)}/mo → ₹${fmt(drift.current_avg)}/mo)`}
                            >
                              {up ? '▲' : '▼'}{Math.abs(drift.drift_pct).toFixed(0)}%
                            </span>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs ${statusDotClass(dec)}`}>
                          {statusLabel(dec)}
                        </span>
                        {!isSkipped && (
                          <span className="text-sm font-semibold text-gray-700">
                            ₹{fmt(dec.amount)}/mo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Adjust this plan
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? 'Deleting…' : 'Delete goal'}
          </button>
        </div>
      </div>

      {/* Adjust plan modal — pre-filled with this goal */}
      <CreateGoalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => {
          setIsModalOpen(false)
          navigate('/goals')
        }}
        initialGoal={goal}
      />
    </div>
  )
}

// ─── Inline nav bar ────────────────────────────────────────────────────────────
interface NavBarProps {
  user: { email: string } | null
  onDashboard: () => void
  onGoals: () => void
  onAnalytics: () => void
  onLogout: () => void
}

const NavBar = ({ user, onDashboard, onGoals, onAnalytics, onLogout }: NavBarProps) => (
  <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
    <button onClick={onDashboard} className="text-left hover:opacity-75 transition-opacity">
      <h1 className="text-xl font-bold text-gray-900">FinSight</h1>
      <p className="text-xs text-gray-400">Personal Finance Analyser</p>
    </button>
    <div className="flex items-center gap-4">
      <button onClick={onDashboard} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Dashboard
      </button>
      <button onClick={onAnalytics} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Analytics
      </button>
      <button onClick={onGoals} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Goals
      </button>
      <UserMenu email={user?.email} onLogout={onLogout} />
    </div>
  </div>
)

export default GoalDetailPage
