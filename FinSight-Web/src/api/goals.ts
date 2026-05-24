import api from './axios'
import type {
  GoalResponse,
  GoalSaveRequest,
  SavedGoalListResponse,
} from '../models/goals'

interface GoalInvestmentPayload {
  amount: number
  date: string        // YYYY-MM-DD
  note?: string
}

interface GoalApiPayload {
  goal_amount: number
  goal_months: number
  income_override?: number
}

/** POST /goals — run ML pipeline, returns ranked recommendations. */
export const getGoalPlanApi = async (payload: GoalApiPayload): Promise<GoalResponse> => {
  const response = await api.post<GoalResponse>('/goals', payload)
  return response.data
}

/** POST /goals/save — persist a finalised plan. */
export const saveGoalApi = async (payload: GoalSaveRequest): Promise<{ id: string; message: string }> => {
  const response = await api.post<{ id: string; message: string }>('/goals/save', payload)
  return response.data
}

/** GET /goals — list saved goals with live on-track status. */
export const listGoalsApi = async (): Promise<SavedGoalListResponse> => {
  const response = await api.get<SavedGoalListResponse>('/goals')
  return response.data
}

/** DELETE /goals/{id} — remove a saved goal. */
export const deleteGoalApi = async (goalId: string): Promise<void> => {
  await api.delete(`/goals/${goalId}`)
}

/**
 * PATCH /goals/{id}/existing-savings
 * Toggle whether the user's pre-existing investment savings count toward this goal's progress.
 */
export const toggleExistingSavingsApi = async (goalId: string, count: boolean): Promise<void> => {
  await api.patch(`/goals/${goalId}/existing-savings`, { count_existing_savings: count })
}

/**
 * POST /goals/{id}/investments — record a manual investment tagged to this goal.
 */
export const addGoalInvestmentApi = async (
  goalId: string,
  payload: GoalInvestmentPayload,
): Promise<{ id: string; message: string }> => {
  const response = await api.post<{ id: string; message: string }>(
    `/goals/${goalId}/investments`,
    payload,
  )
  return response.data
}

/**
 * DELETE /goals/{id}/investments/{invId} — remove a tagged investment.
 */
export const deleteGoalInvestmentApi = async (
  goalId: string,
  invId: string,
): Promise<void> => {
  await api.delete(`/goals/${goalId}/investments/${invId}`)
}

/**
 * POST /goals/{id}/recalculate-savings
 * Re-snaps accumulated_savings_at_creation from current Investments transactions.
 * Needed for goals created before the column existed (they store 0).
 */
export const recalculateSavingsApi = async (
  goalId: string,
): Promise<{ accumulated_savings_at_creation: number; message: string }> => {
  const response = await api.post<{ accumulated_savings_at_creation: number; message: string }>(
    `/goals/${goalId}/recalculate-savings`,
  )
  return response.data
}
