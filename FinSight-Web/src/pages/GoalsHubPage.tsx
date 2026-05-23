/**
 * GoalsHubPage — Screen 1 of the Goals feature (/goals).
 *
 * Shows:
 *   - Monthly snapshot (always visible)
 *   - Saved goal cards with status, progress, cutback summary
 *   - Empty state with CTA
 *   - [+ New Goal] button opens CreateGoalModal
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { listGoalsApi, deleteGoalApi } from '../api/goals'
import type { SavedGoal, SavedGoalListResponse } from '../models/goals'
import MonthlySnapshot from '../components/goals/MonthlySnapshot'
import CreateGoalModal from '../components/goals/CreateGoalModal'
import { GOAL_STATUS_LABELS, GOAL_STATUS_BADGE } from '../constants/config'
import UserMenu from '../components/shared/UserMenu'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const targetDateLabel = (months: number, createdAt: string): string => {
  const d = new Date(createdAt)
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** Count non-skipped decisions in a goal's plan. */
const activeCutbackCount = (goal: SavedGoal): number =>
  Object.values(goal.decisions).filter(d => d.status !== 'skipped').length

// ─── component ─────────────────────────────────────────────────────────────────
const GoalsHubPage = () => {
  const navigate   = useNavigate()
  const { user, logout } = useAuth()

  const [listData,          setListData]          = useState<SavedGoalListResponse | null>(null)
  const [isLoading,         setIsLoading]         = useState(true)
  const [loadError,         setLoadError]         = useState<string | null>(null)
  const [deletingId,        setDeletingId]        = useState<string | null>(null)
  const [isModalOpen,       setIsModalOpen]       = useState(false)

  // ── Fetch saved goals ──────────────────────────────────────────
  const loadGoals = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await listGoalsApi()
      setListData(data)
    } catch {
      setLoadError('Could not load your goals. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadGoals() }, [loadGoals])

  // ── Income & saving for the snapshot card (from Salary-tagged transactions) ──
  const effectiveIncome = listData?.monthly_income_estimate ?? 0
  const effectiveSaving = listData
    ? Math.max(effectiveIncome - listData.avg_monthly_spend, 0)
    : 0

  // ── Delete a goal ──────────────────────────────────────────────
  const handleDelete = async (goalId: string) => {
    if (!window.confirm('Delete this goal? This cannot be undone.')) return
    setDeletingId(goalId)
    try {
      await deleteGoalApi(goalId)
      // Optimistic update — remove from local state immediately
      setListData(prev => {
        if (!prev) return prev
        return { ...prev, goals: prev.goals.filter(g => g.id !== goalId) }
      })
      // Reload to get fresh snapshot numbers
      await loadGoals()
    } catch {
      setLoadError('Could not delete the goal. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── After modal saves a goal ───────────────────────────────────
  const handleGoalSaved = async () => {
    setIsModalOpen(false)
    await loadGoals()
  }

  const goals = listData?.goals ?? []

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ───────────────────────────────────────────── */}
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
            onClick={() => navigate('/analytics')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Analytics
          </button>
          <UserMenu email={user?.email} onLogout={logout} />
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Goals</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Goal
          </button>
        </div>

        {/* Monthly snapshot */}
        {listData && (
          <MonthlySnapshot
            monthlyIncome={effectiveIncome}
            avgMonthlySpend={listData.avg_monthly_spend}
            currentSaving={effectiveSaving}
            totalRequired={listData.total_required_monthly_saving}
          />
        )}

        {/* ── Loading skeleton ──────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col gap-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/5 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-3/5 mb-4" />
                <div className="h-2 bg-gray-200 rounded-full w-full mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* ── Load error ────────────────────────────────────── */}
        {loadError && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-4">
            <p className="text-sm text-red-700">{loadError}</p>
            <button
              onClick={loadGoals}
              className="text-xs text-red-600 font-medium mt-1 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────── */}
        {!isLoading && !loadError && goals.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-12 text-center">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-800 mb-1">
              You don't have any savings goals yet.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Set a goal and we'll show you exactly how to reach it.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Create your first goal
            </button>
          </div>
        )}

        {/* ── Goal cards ────────────────────────────────────── */}
        {!isLoading && goals.length > 0 && (
          <div className="flex flex-col gap-4">
            {goals.map(goal => {
              const isDeleting = deletingId === goal.id
              const statusLabel = GOAL_STATUS_LABELS[goal.status] ?? goal.status
              const statusClass = GOAL_STATUS_BADGE[goal.status] ?? 'bg-gray-100 text-gray-600'
              const cutbackCount = activeCutbackCount(goal)

              return (
                <div
                  key={goal.id}
                  className={`bg-white rounded-xl border border-gray-100 p-5 transition-opacity ${isDeleting ? 'opacity-50' : ''}`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-gray-900 truncate">
                          {goal.goal_name}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        ₹{fmt(goal.goal_amount)} by {targetDateLabel(goal.goal_months, goal.created_at)}
                      </p>
                    </div>
                    <p className="text-base font-bold text-gray-800 flex-shrink-0">
                      ₹{fmt(goal.required_monthly_saving)}<span className="text-xs font-normal text-gray-400">/mo</span>
                    </p>
                  </div>

                  {/* Tracking progress bar */}
                  {goal.tracking && goal.tracking.months_elapsed > 0 && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Progress</span>
                        <span className="text-xs font-medium text-gray-500">
                          {goal.tracking.progress_pct.toFixed(1)}% · ₹{fmt(goal.tracking.cumulative_contribution)} saved
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(goal.tracking.progress_pct, 100)}%`,
                            backgroundColor: goal.tracking.overall_status === 'ahead' ? '#10b981'
                              : goal.tracking.overall_status === 'on_track' ? '#3b82f6'
                              : '#f59e0b',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {(!goal.tracking || goal.tracking.months_elapsed === 0) && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Progress</span>
                        <span className="text-xs font-medium text-gray-500">0% · tracking starts this month</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full" />
                    </div>
                  )}

                  {/* Cutback summary */}
                  {cutbackCount > 0 && (
                    <p className="text-xs text-gray-400 mb-3">
                      {cutbackCount} spending cutback{cutbackCount !== 1 ? 's' : ''} planned
                      {' · '}₹{fmt(goal.total_monthly_cutback)}/mo committed
                    </p>
                  )}
                  {goal.tracking && goal.tracking.projected_months_to_goal != null && (
                    <p className="text-xs text-gray-400 mb-3">
                      At current pace: goal in ~{Math.ceil(goal.tracking.projected_months_to_goal)} months
                      {goal.tracking.projected_months_to_goal <= goal.goal_months ? ' ✓' : ' (behind schedule)'}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-50">
                    <button
                      onClick={() => navigate(`/goals/${goal.id}`)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      View details →
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      disabled={isDeleting}
                      className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 ml-auto"
                    >
                      {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Create Goal Modal ─────────────────────────────────── */}
      <CreateGoalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleGoalSaved}
      />
    </div>
  )
}

export default GoalsHubPage
