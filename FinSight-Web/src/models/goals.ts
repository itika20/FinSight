// ─── Requests ────────────────────────────────────────────────────────────────

export interface GoalRequest {
  goal_name: string
  goal_amount: number
  goal_months: number
  income_override?: number  // user-supplied if estimated income is wrong
}

export interface GoalSaveRequest {
  goal_name: string
  goal_amount: number
  goal_months: number
  required_monthly_saving: number
  monthly_income_used: number
  income_override?: number
  cluster_id?: number
  cluster_label?: string
  decisions: Record<string, RecommendationDecision>
  total_monthly_cutback: number
}

// ─── Plan response (POST /goals) ──────────────────────────────────────────────

export interface CategoryCutback {
  category: string
  current_monthly_spend: number
  recommended_monthly_spend: number
  monthly_saving: number           // max saving available from this category
  peer_avg_monthly_spend: number
}

export interface GoalResponse {
  cluster_id: number
  cluster_label: string
  monthly_income_estimate: number
  current_monthly_saving: number           // raw saving from transactions
  committed_monthly_saving: number         // locked by other saved goals
  available_monthly_saving: number         // current - committed
  required_monthly_saving: number          // goal_amount / goal_months
  shortfall: number                        // required - available (0 if on track)
  achievable_from_overspend: boolean
  covered_monthly_saving: number
  recommendations: CategoryCutback[]
  message: string
  investment_insight: string | null   // positive opportunity flag; null when already on track
}

// ─── Recommendation decisions ─────────────────────────────────────────────────

export type RecommendationStatus = 'accepted' | 'modified' | 'skipped'

export interface RecommendationDecision {
  status: RecommendationStatus
  amount: number
}

// ─── Saved goal (GET /goals) ──────────────────────────────────────────────────

export interface SavedGoal {
  id: string
  goal_name: string
  goal_amount: number
  goal_months: number
  required_monthly_saving: number
  monthly_income_used: number
  income_override?: number
  cluster_id?: number
  cluster_label?: string
  decisions: Record<string, RecommendationDecision>
  total_monthly_cutback: number
  created_at: string        // YYYY-MM-DD
  // Computed at fetch time:
  coverage_amount: number   // how much of required is covered from available saving
  coverage_percent: number  // 0-100
  status: 'on_track' | 'at_risk' | 'off_track'
}

export interface SavedGoalListResponse {
  goals: SavedGoal[]
  current_monthly_saving: number        // income - avg_spend (what's free each month)
  monthly_income_estimate: number       // median credit income used for the calculation
  avg_monthly_spend: number             // average debit spend used for the calculation
  total_required_monthly_saving: number
  total_committed_cutback: number
}
