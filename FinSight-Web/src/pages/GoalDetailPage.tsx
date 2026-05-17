/**
 * GoalDetailPage — Screen 3 of the Goals feature (/goals/:id).
 *
 * Read-only view of a single saved goal.
 * Fetches all goals via listGoalsApi() and finds the one matching the URL id.
 *
 * Shows:
 *   - Goal name, target amount, status badge
 *   - Required monthly saving, target date
 *   - Progress bar (hardcoded to 0% — actual tracking TBD)
 *   - Plan decisions table (category, target spend, saving/month)
 *   - [Adjust this plan] opens CreateGoalModal pre-filled
 *   - [Delete goal] deletes and navigates back
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { listGoalsApi, deleteGoalApi } from '../api/goals'
import type { SavedGoal, RecommendationDecision } from '../models/goals'
import CreateGoalModal from '../components/goals/CreateGoalModal'
import { GOAL_STATUS_LABELS, GOAL_STATUS_BADGE, CATEGORY_COLORS } from '../constants/config'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const targetDateLabel = (months: number): string => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
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

  const [goal,        setGoal]        = useState<SavedGoal | null>(null)
  const [allGoals,    setAllGoals]    = useState<SavedGoal[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [isDeleting,  setIsDeleting]  = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const data = await listGoalsApi()
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
    load()
  }, [id])

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

  // Income override from the most recently created goal that has one
  const defaultIncomeOverride: number | undefined = (() => {
    const sorted = [...allGoals].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return sorted.find(g => g.income_override != null)?.income_override
  })()

  // ── Loading skeleton ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onLogout={logout} />
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
        <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onLogout={logout} />
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

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar user={user} onDashboard={() => navigate('/dashboard')} onGoals={() => navigate('/goals')} onLogout={logout} />

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

        {/* Goal header */}
        <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-2xl font-bold text-gray-900">{goal.goal_name}</h2>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
              {label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            ₹{fmt(goal.goal_amount)} by {targetDateLabel(goal.goal_months)}
            {' · '}₹{fmt(goal.required_monthly_saving)}/month needed
          </p>

          {/* Progress bar */}
          <div className="mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">Progress toward goal</span>
              <span className="text-xs font-medium text-gray-500">0% saved</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: '0%' }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Actual progress tracking coming soon.
            </p>
          </div>
        </div>

        {/* Plan summary card */}
        <div className="bg-white rounded-xl border border-gray-100 px-6 py-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Your spending plan</h3>
            <p className="text-sm font-bold text-green-600">
              ₹{fmt(totalCutback)}/mo total cutback
            </p>
          </div>

          {decisionEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No cutbacks in this plan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50">
              {decisionEntries.map(([category, dec]) => {
                const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B'
                const isSkipped = dec.status === 'skipped'
                return (
                  <div
                    key={category}
                    className={`flex items-center justify-between gap-3 py-2.5 ${isSkipped ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm text-gray-800 truncate">{category}</span>
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
        incomeOverride={defaultIncomeOverride}
        initialGoal={goal}
      />
    </div>
  )
}

// ─── Inline nav bar (same structure as GoalsHubPage) ──────────────────────────
interface NavBarProps {
  user: { email: string } | null
  onDashboard: () => void
  onGoals: () => void
  onLogout: () => void
}

const NavBar = ({ user, onDashboard, onGoals, onLogout }: NavBarProps) => (
  <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
    <button onClick={onDashboard} className="text-left hover:opacity-75 transition-opacity">
      <h1 className="text-xl font-bold text-gray-900">FinSight</h1>
      <p className="text-xs text-gray-400">Personal Finance Analyser</p>
    </button>
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-500">{user?.email}</span>
      <button onClick={onDashboard} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Dashboard
      </button>
      <button onClick={onGoals} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Goals
      </button>
      <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
        Logout
      </button>
    </div>
  </div>
)

export default GoalDetailPage
