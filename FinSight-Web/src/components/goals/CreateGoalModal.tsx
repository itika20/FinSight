/**
 * CreateGoalModal — Screen 2 of the Goals feature.
 *
 * Phase A (form): goal name · amount · timeline · income override
 * Phase B (plan): recommendations · plan health · save
 *
 * Both phases live inside this single modal — no page navigation.
 * User returns to Phase A via the back arrow in Phase B.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getGoalPlanApi, saveGoalApi } from '../../api/goals'
import { getTransactionsApi, updateCategoryApi } from '../../api/upload'
import RecommendationCard from './RecommendationCard'
import PlanHealthBar from './PlanHealthBar'
import { GOAL_MODAL } from '../../constants/config'
import type {
  GoalResponse,
  RecommendationDecision,
  SavedGoal,
} from '../../models/goals'
import type { Transaction } from '../../models'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const toIndianFormat = (digits: string): string => {
  if (!digits) return ''
  const n = parseInt(digits, 10)
  return isNaN(n) ? '' : n.toLocaleString('en-IN')
}

const parseAmount = (formatted: string): number =>
  parseFloat(formatted.replace(/,/g, ''))

const targetDateLabel = (months: number): string => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// ─── props ─────────────────────────────────────────────────────────────────────
interface CreateGoalModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called after a goal is successfully saved — parent should refresh list. */
  onSaved: () => void
  /** Pre-fill for "Adjust this plan" flow from GoalDetailPage. */
  initialGoal?: SavedGoal
}

// ─── component ─────────────────────────────────────────────────────────────────
type Phase = 'form' | 'plan'

const CreateGoalModal = ({
  isOpen,
  onClose,
  onSaved,
  initialGoal,
}: CreateGoalModalProps) => {
  // ── Phase A state ────────────────────────────────────────────
  const [phase,         setPhase]         = useState<Phase>('form')
  const [name,          setName]          = useState('')
  const [amountDisplay, setAmountDisplay] = useState('')
  const [months,        setMonths]        = useState(12)
  const [errors,        setErrors]        = useState<Record<string, string>>({})
  const [isLoading,     setIsLoading]     = useState(false)
  const [apiError,      setApiError]      = useState<string | null>(null)

  // ── Phase B state ────────────────────────────────────────────
  const [goalData,           setGoalData]           = useState<GoalResponse | null>(null)
  const [decisions,          setDecisions]          = useState<Record<string, RecommendationDecision>>({})
  const [showAllCards,       setShowAllCards]       = useState(false)
  const [isSaving,           setIsSaving]           = useState(false)
  const [saveError,          setSaveError]          = useState<string | null>(null)
  // Inline goal adjustment inside Phase B
  const [isAdjusting,        setIsAdjusting]        = useState(false)
  const [adjustAmountDisplay,setAdjustAmountDisplay] = useState('')
  const [adjustMonths,       setAdjustMonths]       = useState(12)
  const [isRecalculating,    setIsRecalculating]    = useState(false)
  const [recalcError,        setRecalcError]        = useState<string | null>(null)

  // ── No-salary recovery state ────────────────────────────
  const [showSalarySetup,   setShowSalarySetup]   = useState(false)
  const [salaryTxList,      setSalaryTxList]      = useState<Transaction[]>([])
  const [isLoadingSalaryTx, setIsLoadingSalaryTx] = useState(false)
  const [taggingId,         setTaggingId]         = useState<string | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)

  // ── Pre-fill from initialGoal (Adjust flow) ──────────────────
  useEffect(() => {
    if (initialGoal) {
      setName(initialGoal.goal_name)
      setAmountDisplay(toIndianFormat(initialGoal.goal_amount.toFixed(0)))
      setMonths(initialGoal.goal_months)
    }
  }, [initialGoal])

  // ── Reset state when modal opens ─────────────────────────────
  useEffect(() => {
    if (isOpen && !initialGoal) {
      setPhase('form')
      setName('')
      setAmountDisplay('')
      setMonths(12)
      setErrors({})
      setApiError(null)
      setGoalData(null)
      setDecisions({})
      setShowAllCards(false)
      setSaveError(null)
      setShowSalarySetup(false)
      setSalaryTxList([])
      setTaggingId(null)
    }
  }, [isOpen, initialGoal])

  // ── Esc key to close ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, phase, decisions])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus trap ───────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const firstFocusable = modalRef.current.querySelector<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }
  }, [isOpen, phase])

  // ─── Close with confirmation if Phase B has decisions ─────────
  const handleClose = useCallback(() => {
    if (phase === 'plan' && Object.keys(decisions).length > 0) {
      if (!window.confirm('Discard this plan? Your changes will be lost.')) return
    }
    onClose()
  }, [phase, decisions, onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }

  // ─── Amount field ─────────────────────────────────────────────
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '')
    setAmountDisplay(toIndianFormat(digits))
    if (errors.amount) setErrors(p => ({ ...p, amount: '' }))
  }

  // ─── Validate Phase A form ────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!name.trim())            newErrors.name   = 'Give your goal a name'
    if (name.trim().length > 80) newErrors.name   = 'Keep it under 80 characters'
    const amt = parseAmount(amountDisplay)
    if (!amountDisplay.trim())   newErrors.amount = 'Goal amount is required'
    else if (isNaN(amt) || amt <= 0) newErrors.amount = 'Enter a positive amount'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ─── Phase A → Phase B: call API ─────────────────────────────
  const handleShowPlan = async () => {
    if (!validate()) return
    setIsLoading(true)
    setApiError(null)
    const amount = parseAmount(amountDisplay)
    try {
      const result = await getGoalPlanApi({
        goal_amount: amount,
        goal_months: months,
      })
      console.log('[CreateGoalModal] API response: cluster=%d recs=%d', result.cluster_id, result.recommendations.length)
      setGoalData(result)
      // All recommendations start as accepted
      const initial: Record<string, RecommendationDecision> = {}
      result.recommendations.forEach(r => {
        initial[r.category] = { status: 'accepted', amount: r.monthly_saving }
      })
      setDecisions(initial)
      setShowAllCards(false)
      setSaveError(null)
      setPhase('plan')
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: unknown } } }
      const detail = anyErr?.response?.data?.detail
      const detailStr = typeof detail === 'string' ? detail : ''

      if (detailStr.includes("no transactions are tagged as 'Salary'")) {
        // Income-unknown: show inline salary-tagging recovery UI
        setShowSalarySetup(true)
        setIsLoadingSalaryTx(true)
        try {
          const { transactions } = await getTransactionsApi(undefined, undefined, 'credit')
          const topCredits = transactions
            .filter(t => t.category !== 'Salary')
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8)
          setSalaryTxList(topCredits)
        } catch {
          setSalaryTxList([])
        } finally {
          setIsLoadingSalaryTx(false)
        }
      } else {
        setApiError(
          detailStr
            ? detailStr
            : Array.isArray(detail) && detail[0]?.msg
              ? detail[0].msg
              : 'Could not generate recommendations. Please try again.'
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Recalculate plan inline from Phase B ────────────────────
  const handleRecalculate = async () => {
    const newAmount = parseAmount(adjustAmountDisplay)
    if (isNaN(newAmount) || newAmount <= 0 || adjustMonths < 1) return
    setIsRecalculating(true)
    setRecalcError(null)
    setIsAdjusting(false)
    try {
      const result = await getGoalPlanApi({
        goal_amount: newAmount,
        goal_months: adjustMonths,
      })
      // Sync Phase A state so save payload stays consistent
      setAmountDisplay(adjustAmountDisplay)
      setMonths(adjustMonths)
      setGoalData(result)
      const initial: Record<string, RecommendationDecision> = {}
      result.recommendations.forEach(r => {
        initial[r.category] = { status: 'accepted', amount: r.monthly_saving }
      })
      setDecisions(initial)
      setShowAllCards(false)
      setSaveError(null)
    } catch {
      setRecalcError('Could not recalculate. Please try again.')
    } finally {
      setIsRecalculating(false)
    }
  }

  const openAdjust = () => {
    setAdjustAmountDisplay(amountDisplay)
    setAdjustMonths(months)
    setIsAdjusting(true)
  }

  // ─── Tag a transaction as Salary, then retry the plan ────────
  const handleTagAsSalary = async (txId: string) => {
    setTaggingId(txId)
    try {
      await updateCategoryApi(txId, 'Salary')
      // Dismiss salary setup and retry plan generation
      setShowSalarySetup(false)
      setSalaryTxList([])
      await handleShowPlan()
    } catch {
      // Tag failed — leave UI open so user can try another transaction
    } finally {
      setTaggingId(null)
    }
  }

  // ─── Decision change ──────────────────────────────────────────
  const handleDecision = useCallback((category: string, dec: RecommendationDecision) => {
    setDecisions(prev => ({ ...prev, [category]: dec }))
  }, [])

  // ─── Derived plan metrics ─────────────────────────────────────
  const userSelectedSaving = Object.values(decisions)
    .filter(d => d.status !== 'skipped')
    .reduce((sum, d) => sum + d.amount, 0)

  const covered = goalData
    ? goalData.available_monthly_saving + userSelectedSaving
    : 0

  const canSave = goalData ? (covered >= goalData.required_monthly_saving) : false

  // ─── Save plan ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!goalData || !canSave) return
    setIsSaving(true)
    setSaveError(null)
    const totalCutback = Object.values(decisions)
      .filter(d => d.status !== 'skipped')
      .reduce((sum, d) => sum + d.amount, 0)
    const baselines: Record<string, number> = {}
    goalData.recommendations.forEach(r => {
      baselines[r.category] = r.current_monthly_spend
    })
    try {
      await saveGoalApi({
        goal_name:                name.trim(),
        goal_amount:              parseAmount(amountDisplay),
        goal_months:              months,
        required_monthly_saving:  goalData.required_monthly_saving,
        monthly_income_used:      goalData.monthly_income_estimate,
        cluster_id:               goalData.cluster_id,
        cluster_label:            goalData.cluster_label,
        decisions,
        total_monthly_cutback:    totalCutback,
        baselines,
      })
      console.log('[CreateGoalModal] Goal saved successfully')
      onSaved()
    } catch {
      setSaveError('Could not save the goal. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const amountNum = parseAmount(amountDisplay)
  const monthlyEstimate = amountDisplay && months && !isNaN(amountNum) && amountNum > 0
    ? Math.ceil(amountNum / months)
    : null

  const recommendations = goalData?.recommendations ?? []
  const visibleRecs = showAllCards
    ? recommendations
    : recommendations.slice(0, GOAL_MODAL.VISIBLE_CARDS)
  const hiddenCount = recommendations.length - GOAL_MODAL.VISIBLE_CARDS

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-label={phase === 'form' ? 'Create savings goal' : `Plan for ${name}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        ref={modalRef}
        className="relative bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl
                   max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ════════════════════════════════════════════
            PHASE A — Goal definition form
        ════════════════════════════════════════════ */}
        {phase === 'form' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Create a savings goal</h2>
              <button
                onClick={handleClose}
                aria-label="Close modal"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-5">

                {/* Goal name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    What are you saving for?
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => {
                      setName(e.target.value)
                      if (errors.name) setErrors(p => ({ ...p, name: '' }))
                    }}
                    placeholder="e.g. Europe trip, Emergency fund, New laptop"
                    maxLength={80}
                    disabled={isLoading}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all focus:ring-2
                      ${errors.name
                        ? 'border-red-400 bg-red-50 focus:ring-red-200'
                        : 'border-gray-300 bg-white focus:ring-blue-200 focus:border-blue-400'}`}
                  />
                  {errors.name && <p className="text-xs text-red-600">⚠ {errors.name}</p>}
                </div>

                {/* Amount */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">How much?</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amountDisplay}
                      onChange={handleAmountChange}
                      placeholder="1,50,000"
                      disabled={isLoading}
                      className={`w-full pl-8 pr-4 py-2.5 rounded-lg border text-sm outline-none transition-all focus:ring-2
                        ${errors.amount
                          ? 'border-red-400 bg-red-50 focus:ring-red-200'
                          : 'border-gray-300 bg-white focus:ring-blue-200 focus:border-blue-400'}`}
                    />
                  </div>
                  {errors.amount && <p className="text-xs text-red-600">⚠ {errors.amount}</p>}
                </div>

                {/* Timeline slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">By when?</label>
                    <span className="text-sm font-semibold text-blue-600">
                      {months} {months === 1 ? 'month' : 'months'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={GOAL_MODAL.MIN_MONTHS}
                    max={GOAL_MODAL.MAX_MONTHS}
                    value={months}
                    onChange={e => setMonths(parseInt(e.target.value))}
                    disabled={isLoading}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>1 month</span>
                    <span className="text-gray-600">{months} months from now · {targetDateLabel(months)}</span>
                    <span>5 years</span>
                  </div>
                </div>

                {/* Monthly preview */}
                {monthlyEstimate !== null && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <div>
                      <p className="text-sm text-blue-900 font-medium">
                        ₹{monthlyEstimate.toLocaleString('en-IN')}/month needed
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        ₹{amountNum.toLocaleString('en-IN')} over {months} months
                      </p>
                    </div>
                  </div>
                )}

                {/* Salary-tagging recovery (income unknown) */}
                {showSalarySetup && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">FinSight can't find your salary</p>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          Tag your salary credit below — FinSight will re-generate your plan immediately.
                        </p>
                      </div>
                    </div>

                    {isLoadingSalaryTx ? (
                      <div className="flex items-center justify-center gap-2 py-3">
                        <svg className="w-4 h-4 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-amber-600">Loading your credit transactions…</p>
                      </div>
                    ) : salaryTxList.length === 0 ? (
                      <p className="text-xs text-amber-700 text-center py-2">
                        No credit transactions found. Please upload a bank statement first.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {salaryTxList.map(tx => (
                          <div
                            key={tx.transaction_id}
                            className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{tx.description}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {tx.date} · ₹{tx.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <button
                              onClick={() => handleTagAsSalary(tx.transaction_id)}
                              disabled={taggingId !== null}
                              className="ml-3 flex-shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {taggingId === tx.transaction_id ? '…' : 'Tag as Salary'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* API error (non-salary errors) */}
                {apiError && !showSalarySetup && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-red-700 font-medium">Could not generate recommendations</p>
                    <p className="text-xs text-red-500 mt-1">{apiError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer CTA */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white">
              <button
                onClick={handleShowPlan}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analysing your spending…
                  </>
                ) : (
                  <>
                    Show my plan
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════
            PHASE B — Plan view
        ════════════════════════════════════════════ */}
        {phase === 'plan' && goalData && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <button
                onClick={() => setPhase('form')}
                aria-label="Back to goal form"
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">
                  Your plan for {name}
                </h2>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close modal"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable plan body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* Recalculating overlay */}
              {isRecalculating && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm text-gray-500">Recalculating your plan…</p>
                </div>
              )}

              {recalcError && !isRecalculating && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-red-600">{recalcError}</p>
                </div>
              )}

              {/* 1 · Goal summary block */}
              {!isRecalculating && (
              <div className="mb-4">
                <p className="text-2xl font-bold text-gray-900">
                  ₹{fmt(parseAmount(amountDisplay))} in {months} months
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  You need to save ₹{fmt(goalData.required_monthly_saving)}/month
                </p>
              </div>
              )}

              {/* 2–end: rest of plan content (hidden while recalculating) */}
              {!isRecalculating && (<>

              {/* 2 · Multi-goal context (only if other goals exist) */}
              {goalData.committed_monthly_saving > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs font-semibold text-blue-800 mb-0.5">Multi-goal breakdown</p>
                  <p className="text-xs text-blue-700">
                    Your other goals already require{' '}
                    ₹{fmt(goalData.committed_monthly_saving)}/month. This goal needs{' '}
                    ₹{fmt(goalData.required_monthly_saving)}/month more — total{' '}
                    ₹{fmt(goalData.committed_monthly_saving + goalData.required_monthly_saving)}/month.
                    You can save up to ₹{fmt(goalData.current_monthly_saving)}/month based on current spending.
                    {goalData.shortfall > 0 && ' Accept all cutbacks below to make this work.'}
                  </p>
                </div>
              )}

              {/* 3 · Plan health bar (live) */}
              <PlanHealthBar
                covered={covered}
                required={goalData.required_monthly_saving}
              />

              {/* 4 · Recommendation cards */}
              {recommendations.length === 0 ? (
                goalData.shortfall <= 0 ? (
                  /* ── Genuinely on track: available saving already covers the goal ── */
                  <div className="text-center py-10 bg-white rounded-xl border border-gray-100 mb-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">You're already on track!</p>
                    <p className="text-xs text-gray-400 mt-1">No spending cutbacks needed for this goal.</p>
                  </div>
                ) : (
                  /* ── Shortfall exists but nothing to cut: goal is not practical ── */
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-5 mb-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">
                          This goal isn't achievable within {months} months
                        </p>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          Your spending is already within peer benchmarks — there are no cutbacks to recommend.
                          Your available saving of{' '}
                          <span className="font-semibold">₹{fmt(goalData.available_monthly_saving)}/month</span>{' '}
                          covers only{' '}
                          <span className="font-semibold">
                            {Math.round((goalData.available_monthly_saving / goalData.required_monthly_saving) * 100)}%
                          </span>{' '}
                          of the ₹{fmt(goalData.required_monthly_saving)}/month needed.
                        </p>
                      </div>
                    </div>

                    {/* ── Inline goal adjuster ── */}
                    {!isAdjusting ? (
                      <button
                        onClick={openAdjust}
                        className="w-full mt-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Adjust goal →
                      </button>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-amber-200 flex flex-col gap-3">
                        {/* Amount */}
                        <div>
                          <label className="text-xs font-medium text-amber-800 mb-1 block">Goal amount</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">₹</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={adjustAmountDisplay}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, '')
                                setAdjustAmountDisplay(digits ? toIndianFormat(digits) : '')
                              }}
                              autoFocus
                              className="w-full pl-7 pr-3 py-2 rounded-lg border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                            />
                          </div>
                        </div>

                        {/* Months slider */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-amber-800">Timeline</label>
                            <span className="text-xs font-semibold text-amber-700">
                              {adjustMonths} {adjustMonths === 1 ? 'month' : 'months'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={GOAL_MODAL.MIN_MONTHS}
                            max={GOAL_MODAL.MAX_MONTHS}
                            value={adjustMonths}
                            onChange={e => setAdjustMonths(parseInt(e.target.value))}
                            className="w-full accent-amber-600"
                          />
                          <div className="flex justify-between text-xs text-amber-600 mt-0.5">
                            <span>1 month</span>
                            <span>5 years</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={handleRecalculate}
                            className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            Recalculate plan
                          </button>
                          <button
                            onClick={() => setIsAdjusting(false)}
                            className="px-4 py-2 bg-white text-amber-700 border border-amber-300 text-xs font-medium rounded-lg hover:bg-amber-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Recommended cutbacks
                  </p>
                  <div className="flex flex-col gap-3 mb-4">
                    {visibleRecs.map(rec => (
                      <RecommendationCard
                        key={rec.category}
                        rec={rec}
                        decision={decisions[rec.category] ?? { status: 'accepted', amount: rec.monthly_saving }}
                        onDecision={handleDecision}
                      />
                    ))}
                  </div>

                  {/* 5 · Investment insight card (between top cards and show more) */}
                  {goalData.investment_insight && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                      <svg className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <div>
                        <p className="text-xs font-semibold text-teal-800 mb-0.5">Bonus opportunity</p>
                        <p className="text-sm text-teal-700">{goalData.investment_insight}</p>
                        <p className="text-xs text-teal-500 mt-1">This doesn't affect your goal — it's a separate idea.</p>
                      </div>
                    </div>
                  )}

                  {/* 6 · Show more / Show less */}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setShowAllCards(prev => !prev)}
                      className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-2 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors mb-4"
                    >
                      {showAllCards
                        ? 'Show less ▲'
                        : `Show ${hiddenCount} more lower-impact recommendation${hiddenCount === 1 ? '' : 's'} ▼`}
                    </button>
                  )}

                  {/* Hidden cards (shown when expanded) */}
                  {showAllCards && hiddenCount > 0 && (
                    <div className="flex flex-col gap-3 mb-4">
                      {recommendations.slice(GOAL_MODAL.VISIBLE_CARDS).map(rec => (
                        <RecommendationCard
                          key={rec.category}
                          rec={rec}
                          decision={decisions[rec.category] ?? { status: 'accepted', amount: rec.monthly_saving }}
                          onDecision={handleDecision}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ML insight message */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500">{goalData.message}</p>
              </div>

              {/* Close the !isRecalculating fragment */}
              </>)}
            </div>

            {/* Footer actions */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white">
              {saveError && (
                <p className="text-xs text-red-600 mb-2">{saveError}</p>
              )}
              {/* When save is blocked (partial coverage with recommendations), offer inline adjust */}
              {!canSave && !isRecalculating && recommendations.length > 0 && goalData.shortfall > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Still ₹{fmt(Math.max(goalData.required_monthly_saving - covered, 0))} short after all cutbacks
                  </p>
                  <button
                    onClick={openAdjust}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Adjust goal →
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 group">
                  <button
                    onClick={handleSave}
                    disabled={!canSave || isSaving}
                    aria-label={
                      !canSave
                        ? `Accept more recommendations or customise amounts to cover ₹${fmt(Math.max(goalData.required_monthly_saving - covered, 0))} more`
                        : 'Save this plan'
                    }
                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save this plan
                      </>
                    )}
                  </button>
                  {/* Tooltip on disabled */}
                  {!canSave && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 text-xs bg-gray-800 text-white rounded-lg px-3 py-2 hidden group-hover:block pointer-events-none z-10">
                      Accept more recommendations or customise amounts to cover ₹{fmt(Math.max(goalData.required_monthly_saving - covered, 0))} more
                    </div>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default CreateGoalModal
