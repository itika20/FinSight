import api from './axios'
import type {
  GoalResponse,
  GoalSaveRequest,
  SavedGoalListResponse,
} from '../models/goals'

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
