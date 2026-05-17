"""
Pydantic schemas for the goals API.
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


# ─────────────────────────────────────────────
# Inner response models
# ─────────────────────────────────────────────

class CategoryCutback(BaseModel):
    category: str
    current_monthly_spend: float
    recommended_monthly_spend: float
    monthly_saving: float                  # max saving available
    peer_avg_monthly_spend: float


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
    created_at: str
    # Computed at fetch time from live transactions:
    coverage_amount: float     # how much of required is covered by available saving
    coverage_percent: int      # 0-100
    status: str                # 'on_track' | 'at_risk' | 'off_track'


class SavedGoalListResponse(BaseModel):
    goals: list[SavedGoal]
    current_monthly_saving: float       # live estimate: income - avg_spend
    monthly_income_estimate: float      # median credit income used for the saving calculation
    avg_monthly_spend: float            # average debit spend used for the saving calculation
    total_required_monthly_saving: float
    total_committed_cutback: float      # sum of accepted cutbacks across all goals
