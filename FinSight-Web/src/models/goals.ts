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
  baselines: Record<string, number>   // { category: avg_monthly_spend } at plan creation
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

// ─── Spend drift ──────────────────────────────────────────────────────────────

export interface CategoryDrift {
  category: string
  plan_baseline: number   // avg monthly spend stored at goal creation
  current_avg: number     // avg monthly spend in last 3 months
  drift_pct: number       // (current - baseline) / baseline * 100; positive = spending more
}

// ─── Recommendation decisions ─────────────────────────────────────────────────

export type RecommendationStatus = 'accepted' | 'modified' | 'skipped'

export interface RecommendationDecision {
  status: RecommendationStatus
  amount: number
}

// ─── Goal investments ─────────────────────────────────────────────────────────

export interface GoalInvestment {
  id: string
  goal_id: string
  amount: number
  date: string          // YYYY-MM-DD
  note?: string
  created_at: string
}

// ─── Goal tracking ────────────────────────────────────────────────────────────

export interface MonthlyContribution {
  month: string             // 'YYYY-MM'
  net_surplus: number       // informational: salary - expenses
  total_invested: number    // informational: investment debits
  contribution: number      // plan-adherence: ₹ of spending plan actually followed
  target: number
  status: 'ahead' | 'on_track' | 'behind' | 'gap'
}

export interface GoalTracking {
  monthly: MonthlyContribution[]
  cumulative_contribution: number
  cumulative_target: number
  months_elapsed: number
  progress_pct: number
  overall_status: 'ahead' | 'on_track' | 'behind' | 'not_started'
  avg_monthly_contribution: number
  projected_months_to_goal: number | null
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
  // Existing-savings fields:
  accumulated_savings_at_creation: number  // snapshot of Investments total at save time
  count_existing_savings: boolean          // user toggle: count saved pot toward goal
  created_at: string        // YYYY-MM-DD
  baselines: Record<string, number>   // avg monthly spend per category at creation
  // Computed at fetch time:
  coverage_amount: number   // how much of required is covered from available saving
  coverage_percent: number  // 0-100
  status: 'on_track' | 'at_risk' | 'off_track'
  tracking?: GoalTracking
  spend_drift?: CategoryDrift[]       // categories with ≥20% spend shift since creation
  current_month?: string              // 'YYYY-MM' of the most recent data month
  current_month_spend?: Record<string, number>  // actual spend per category in current_month
  // Goal-tagged investments (from goal_investments table):
  tagged_investments?: GoalInvestment[]
  total_tagged_investment?: number    // sum of all tagged investment amounts
}

export interface SavedGoalListResponse {
  goals: SavedGoal[]
  current_monthly_saving: number        // income - avg_spend (what's free each month)
  monthly_income_estimate: number       // median credit income used for the calculation
  avg_monthly_spend: number             // average debit spend used for the calculation
  total_required_monthly_saving: number
  total_committed_cutback: number
}
