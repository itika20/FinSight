"""
Pydantic schemas for the goals API.

DB changes required (run manually):
  CREATE TABLE goal_investments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id),
      goal_id    UUID NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
      amount     DECIMAL(15,2) NOT NULL CHECK (amount > 0),
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      note       VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_goal_investments_user_goal ON goal_investments(user_id, goal_id);
"""

from typing import Any, Optional
from pydantic import BaseModel, field_validator


# ─────────────────────────────────────────────
# Request: generate plan
# ─────────────────────────────────────────────

class GoalRequest(BaseModel):
    goal_amount: float
    goal_months: int
    income_override: Optional[float] = None   # user-supplied income if estimate is wrong
    exclude_goal_id: Optional[str] = None     # set when adjusting an existing goal so it isn't counted as committed saving

    @field_validator('goal_amount')
    @classmethod
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('goal_amount must be positive')
        return v

    @field_validator('goal_months')
    @classmethod
    def months_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('goal_months must be at least 1')
        return v

    @field_validator('income_override')
    @classmethod
    def income_override_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError('income_override must be positive')
        return v


# ─────────────────────────────────────────────
# Request: save a finalised plan
# ─────────────────────────────────────────────

class GoalSaveRequest(BaseModel):
    goal_name: str
    goal_amount: float
    goal_months: int
    required_monthly_saving: float
    monthly_income_used: float
    income_override: Optional[float] = None
    cluster_id: Optional[int] = None
    cluster_label: Optional[str] = None
    decisions: dict[str, Any]          # {category: {status, amount}}
    total_monthly_cutback: float
    baselines: dict[str, float] = {}   # {category: avg_monthly_spend at plan creation}


# ─────────────────────────────────────────────
# Inner response models
# ─────────────────────────────────────────────

class CategoryCutback(BaseModel):
    category: str
    current_monthly_spend: float
    recommended_monthly_spend: float
    monthly_saving: float                  # max saving available
    peer_avg_monthly_spend: float


class CategoryDrift(BaseModel):
    category: str
    plan_baseline: float    # avg monthly spend stored at goal creation
    current_avg: float      # avg monthly spend in last 3 months
    drift_pct: float        # (current - baseline) / baseline * 100; positive = spending more


# ─────────────────────────────────────────────
# Response: generate plan
# ─────────────────────────────────────────────

class GoalResponse(BaseModel):
    cluster_id: int
    cluster_label: str
    monthly_income_estimate: float
    current_monthly_saving: float          # raw saving from transactions
    committed_monthly_saving: float        # already locked by other saved goals
    available_monthly_saving: float        # current - committed (what's free for this goal)
    required_monthly_saving: float         # goal_amount / goal_months
    shortfall: float                       # required - available (0 if already covered)
    achievable_from_overspend: bool
    covered_monthly_saving: float
    recommendations: list[CategoryCutback]
    message: str
    investment_insight: Optional[str] = None   # positive opportunity flag, not a cutback


class MonthlyContribution(BaseModel):
    month: str               # 'YYYY-MM'
    net_surplus: float       # smoothed_salary - net_expenses (informational)
    total_invested: float    # Investment debits this month (informational)
    contribution: float      # plan-adherence: sum of min(max(0, baseline_cat - actual_cat), cutback) per category
    target: float            # goal's required_monthly_saving
    status: str              # 'ahead' | 'on_track' | 'behind'

class GoalTracking(BaseModel):
    monthly: list[MonthlyContribution]
    cumulative_contribution: float
    cumulative_target: float          # months_elapsed × required_monthly_saving
    months_elapsed: int
    progress_pct: float               # cumulative_contribution / goal_amount × 100, capped at 100
    overall_status: str               # 'ahead' | 'on_track' | 'behind' | 'not_started'
    avg_monthly_contribution: float
    projected_months_to_goal: Optional[float]  # None if no contribution yet


# ─────────────────────────────────────────────
# Response: saved goal (with live status)
# ─────────────────────────────────────────────

class SavedGoal(BaseModel):
    id: str
    goal_name: str
    goal_amount: float
    goal_months: int
    required_monthly_saving: float
    monthly_income_used: float
    income_override: Optional[float]
    cluster_id: Optional[int]
    cluster_label: Optional[str]
    decisions: dict[str, Any]
    total_monthly_cutback: float
    # Existing-savings fields:
    accumulated_savings_at_creation: float = 0.0   # snapshot of Investments total at save time
    count_existing_savings: bool = False            # user toggle: count saved pot toward goal
    created_at: str
    baselines: dict[str, float] = {}               # avg monthly spend per category at creation
    # Computed at fetch time from live transactions:
    coverage_amount: float     # how much of required is covered by available saving
    coverage_percent: int      # 0-100
    status: str                # 'on_track' | 'at_risk' | 'off_track'
    tracking: Optional['GoalTracking'] = None
    spend_drift: list['CategoryDrift'] = []        # categories with ≥20% spend shift since creation
    current_month: Optional[str] = None            # 'YYYY-MM' of the most recent data month
    current_month_spend: dict[str, float] = {}     # actual spend per category in current_month
    # Goal-tagged investments (from goal_investments table):
    tagged_investments: list['GoalInvestment'] = []
    total_tagged_investment: float = 0.0           # sum of all tagged investment amounts


class ToggleExistingSavingsRequest(BaseModel):
    count_existing_savings: bool


# ─────────────────────────────────────────────
# Goal investments: manual tagged savings
# ─────────────────────────────────────────────

class GoalInvestmentRequest(BaseModel):
    amount: float
    date: str                       # YYYY-MM-DD
    note: Optional[str] = None

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be positive')
        return v


class GoalInvestment(BaseModel):
    id: str
    goal_id: str
    amount: float
    date: str                       # YYYY-MM-DD
    note: Optional[str] = None
    created_at: str


class SavedGoalListResponse(BaseModel):
    goals: list[SavedGoal]
    current_monthly_saving: float       # live estimate: income - avg_spend
    monthly_income_estimate: float      # median credit income used for the saving calculation
    avg_monthly_spend: float            # average debit spend used for the saving calculation
    total_required_monthly_saving: float
    total_committed_cutback: float      # sum of accepted cutbacks across all goals
