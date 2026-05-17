"""
Goals API

POST /goals          — generate a personalised plan (3-model ML pipeline)
POST /goals/save     — persist a finalised plan to the database
GET  /goals          — list saved goals with live on-track status
DELETE /goals/{id}   — remove a saved goal
"""

import logging

from fastapi import APIRouter, Depends, Request

from app.api.auth import get_current_user
from app.core.constants import LOGGER_GOALS
from app.core.database import get_db
from app.schemas.goals import (
    GoalRequest,
    GoalResponse,
    GoalSaveRequest,
    SavedGoalListResponse,
)
from app.services import goal_service

logger = logging.getLogger(LOGGER_GOALS)
router = APIRouter(prefix='/goals', tags=['Goals'])


@router.post('', response_model=GoalResponse)
def create_goal_plan(
    request: Request,
    body: GoalRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a savings plan using the 3-model ML pipeline.

    Accounts for saving already committed to other saved goals so that
    the shortfall reflects what is actually available for this new goal.

    Optional income_override replaces the estimated income for users whose
    credit transactions do not reflect their true take-home pay.

    Errors:
      422 — fewer than 2 months of transaction data
      422 — cannot estimate income (no qualifying credit transactions) — only
             raised when income_override is NOT provided
    """
    user_id = current_user['id']
    logger.info(
        "[goals] POST /goals user=%s goal=Rs%.0f in %d months income_override=%s",
        user_id, body.goal_amount, body.goal_months, body.income_override,
    )
    with get_db() as conn:
        result = goal_service.compute_goal_plan(
            user_id=user_id,
            goal_amount=body.goal_amount,
            goal_months=body.goal_months,
            cluster_model=request.app.state.cluster_model,
            cluster_scaler=request.app.state.cluster_scaler,
            elasticity_model=request.app.state.elasticity_model,
            elasticity_scaler=request.app.state.elasticity_scaler,
            ranker_model=request.app.state.ranker_model,
            benchmarks=request.app.state.cluster_benchmarks,
            conn=conn,
            income_override=body.income_override,
        )
    return result


@router.post('/save', response_model=dict)
def save_goal_plan(
    body: GoalSaveRequest,
    current_user: dict = Depends(get_current_user),
):
    """Save a finalised goal plan so the user can track it over time."""
    user_id = current_user['id']
    logger.info("[goals] POST /goals/save user=%s name=%s", user_id, body.goal_name)
    with get_db() as conn:
        goal_id = goal_service.save_goal_plan(user_id, body, conn)
    return {'id': goal_id, 'message': 'Goal saved successfully.'}


@router.get('', response_model=SavedGoalListResponse)
def list_saved_goals(
    current_user: dict = Depends(get_current_user),
):
    """
    Return all saved goals with live on-track status.

    Goals are filled greedily in creation order from the user's current
    monthly saving, so multi-goal shortfalls are surfaced correctly.
    """
    user_id = current_user['id']
    logger.info("[goals] GET /goals user=%s", user_id)
    with get_db() as conn:
        return goal_service.get_saved_goals(user_id, conn)


@router.delete('/{goal_id}', response_model=dict)
def delete_goal(
    goal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a saved goal. Only the owning user can delete their own goals."""
    user_id = current_user['id']
    logger.info("[goals] DELETE /goals/%s user=%s", goal_id, user_id)
    with get_db() as conn:
        goal_service.delete_goal(user_id, goal_id, conn)
    return {'message': 'Goal deleted.'}
