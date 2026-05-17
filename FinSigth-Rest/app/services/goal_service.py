"""
Goal service -- orchestrates the 3-model savings recommendation pipeline.

Runtime flow (POST /goals):
  1. build_user_profile()      -- aggregate DB transactions into 12-feature vector
  2. get_committed_saving()    -- sum required_monthly_saving from other saved goals
  3. assign_cluster()          -- Model 1: K-Means cluster assignment
  4. compute_gaps()            -- user spend vs cluster benchmark per category
  5. predict_elasticity()      -- Model 2: Random Forest predicts max reduction %
  6. rank_recommendations()    -- Model 3: LightGBM ranks by predicted acceptance
  7. allocate_cutbacks()       -- fill shortfall from top-ranked recommendations
  8. build_response()          -- assemble GoalResponse

Additional helpers:
  save_goal_plan()             -- persist a finalised plan to user_goals table
  get_saved_goals()            -- fetch saved goals with live on-track status
  delete_goal()                -- remove a saved goal
"""

import json
import logging
import statistics
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from app.core.constants import (
    CATEGORY_FEATURE_MAP,
    ERROR_INCOME_UNKNOWN,
    ERROR_INSUFFICIENT_HISTORY,
    GOAL_MIN_MONTHS_DATA,
    GOAL_OVERSPEND_THRESHOLD,
    INCOME_MIN_CREDIT_AMOUNT,
    INVESTMENT_INSIGHT_THRESHOLD,
    LOGGER_GOALS,
    NON_CUTTABLE_CATEGORIES,
    TRANSACTION_TYPE_CREDIT,
    TRANSACTION_TYPE_DEBIT,
)
from app.schemas.goals import CategoryCutback, GoalResponse, SavedGoal, SavedGoalListResponse

logger = logging.getLogger(LOGGER_GOALS)

# ─────────────────────────────────────────────────────────────────────────────
# Feature orders — must match finsight-ml training exactly
# ─────────────────────────────────────────────────────────────────────────────
CLUSTER_FEATURE_ORDER = [
    'monthly_income_estimate', 'food_pct', 'groceries_pct', 'transport_pct',
    'shopping_pct', 'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct', 'savings_rate', 'spend_volatility_normalised',
]

ELASTICITY_FEATURE_ORDER = [
    'current_avg_monthly_spend',
    'spend_vs_cluster_benchmark',
    'spend_volatility_normalised',
    'income_bracket_encoded',
    'category_type',
    'months_consistently_present',
]

RANKER_FEATURE_ORDER = [
    'estimated_monthly_saving',
    'spend_vs_benchmark_ratio',
    'category_acceptance_rate',
    'user_has_reduced_before',
    'goal_months_remaining',
    'gap_to_goal',
    'category_priority_rank',
    'category_type',
]

# ─────────────────────────────────────────────────────────────────────────────
# Domain lookups
# ─────────────────────────────────────────────────────────────────────────────
CATEGORY_TYPE = {
    'Food': 0.50, 'Groceries': 0.15, 'Transport': 0.40, 'Shopping': 0.90,
    'Entertainment': 1.00, 'Utilities': 0.10, 'Healthcare': 0.05,
    'Investments': 0.30, 'Fuel': 0.45,
}

CATEGORY_ACCEPTANCE_RATE = {
    'Food': 0.45, 'Groceries': 0.30, 'Transport': 0.35, 'Shopping': 0.60,
    'Entertainment': 0.65, 'Utilities': 0.25, 'Healthcare': 0.15,
    'Investments': 0.20, 'Fuel': 0.40,
}

INCOME_BRACKET_BOUNDS = [
    ('low', 30_000), ('medium', 75_000), ('high', 150_000), ('premium', float('inf')),
]
BRACKET_ENCODING = {'low': 0, 'medium': 1, 'high': 2, 'premium': 3}


def _income_bracket_encoded(income: float) -> int:
    for name, upper in INCOME_BRACKET_BOUNDS:
        if income < upper:
            return BRACKET_ENCODING[name]
    return BRACKET_ENCODING['premium']


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 -- Build user feature vector from DB
# ─────────────────────────────────────────────────────────────────────────────
def build_user_profile(
    user_id: str,
    conn,
    income_override: Optional[float] = None,
) -> dict:
    """
    Aggregates transaction history into the 12-feature cluster vector.

    If income_override is provided it is used instead of the median-credit estimate,
    and the credit query is skipped entirely (so 422 income_unknown is never raised
    when the user has supplied their own figure).
    """
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               category,
               SUM(ABS(amount)) AS monthly_amount
        FROM transactions
        WHERE user_id = %s AND type = %s AND category IS NOT NULL
        GROUP BY TO_CHAR(date, 'YYYY-MM'), category
        """,
        (user_id, TRANSACTION_TYPE_DEBIT),
    )
    debit_rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               SUM(ABS(amount)) AS monthly_total
        FROM transactions
        WHERE user_id = %s AND type = %s
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id, TRANSACTION_TYPE_DEBIT),
    )
    total_rows = cursor.fetchall()

    months_with_data = {row['month'] for row in total_rows}
    if len(months_with_data) < GOAL_MIN_MONTHS_DATA:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=ERROR_INSUFFICIENT_HISTORY.format(min_months=GOAL_MIN_MONTHS_DATA),
        )

    if income_override is not None:
        income_estimate = income_override
    else:
        cursor.execute(
            """
            SELECT TO_CHAR(date, 'YYYY-MM') AS month,
                   SUM(amount) AS monthly_credit
            FROM transactions
            WHERE user_id = %s AND type = %s AND amount >= %s
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            """,
            (user_id, TRANSACTION_TYPE_CREDIT, INCOME_MIN_CREDIT_AMOUNT),
        )
        credit_rows = cursor.fetchall()
        monthly_credits = [row['monthly_credit'] for row in credit_rows]
        if not monthly_credits:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=ERROR_INCOME_UNKNOWN.format(threshold=INCOME_MIN_CREDIT_AMOUNT),
            )
        income_estimate = statistics.median(monthly_credits)

    # Per-category monthly averages
    monthly_by_cat: dict[str, dict[str, float]] = {}
    for row in debit_rows:
        month = row['month']
        if month not in monthly_by_cat:
            monthly_by_cat[month] = {}
        monthly_by_cat[month][row['category']] = float(row['monthly_amount'])

    n_months = len(months_with_data)
    avg_by_cat: dict[str, float] = {}
    for db_cat in CATEGORY_FEATURE_MAP:
        total = sum(monthly_by_cat.get(m, {}).get(db_cat, 0.0) for m in months_with_data)
        avg_by_cat[db_cat] = total / n_months

    months_by_category: dict[str, int] = {}
    for db_cat in CATEGORY_FEATURE_MAP:
        months_active = sum(1 for m in months_with_data if monthly_by_cat.get(m, {}).get(db_cat, 0) > 0)
        months_by_category[db_cat] = months_active

    monthly_totals = {row['month']: float(row['monthly_total']) for row in total_rows}
    avg_total_spend = sum(monthly_totals.values()) / n_months
    savings_rate = max(-1.0, min(1.0, (income_estimate - avg_total_spend) / income_estimate))

    total_list = list(monthly_totals.values())
    volatility = float(np.std(total_list, ddof=1)) / income_estimate if len(total_list) >= 2 else 0.10

    profile = {'monthly_income_estimate': income_estimate}
    for db_cat, feature_name in CATEGORY_FEATURE_MAP.items():
        profile[f'{feature_name}_pct'] = avg_by_cat[db_cat] / income_estimate
    profile['savings_rate'] = savings_rate
    profile['spend_volatility_normalised'] = volatility
    profile['_months_by_category'] = months_by_category

    return profile


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 -- How much saving is already committed to other saved goals?
# ─────────────────────────────────────────────────────────────────────────────
def get_committed_saving(user_id: str, conn) -> float:
    """
    Returns the sum of required_monthly_saving across all saved goals for this user.
    Used to compute available_monthly_saving = current_saving - committed.
    """
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(SUM(required_monthly_saving), 0) AS committed FROM user_goals WHERE user_id = %s",
        (user_id,),
    )
    row = cursor.fetchone()
    return float(row['committed'])


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 -- Assign cluster (Model 1)
# ─────────────────────────────────────────────────────────────────────────────
def assign_cluster(profile: dict, model, scaler) -> int:
    feature_vector = pd.DataFrame(
        [[profile[f] for f in CLUSTER_FEATURE_ORDER]],
        columns=CLUSTER_FEATURE_ORDER,
    )
    return int(model.predict(scaler.transform(feature_vector))[0])


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 -- Compute overspend gaps
# ─────────────────────────────────────────────────────────────────────────────
def compute_gaps(
    profile: dict,
    benchmark: dict,
) -> tuple[list[tuple[str, dict]], Optional[str]]:
    """
    Returns (gaps, investment_insight).

    gaps             — categories where user overspends vs peer benchmark,
                       with NON_CUTTABLE_CATEGORIES removed so they never
                       reach Model 2 or Model 3.
    investment_insight — positive opportunity string when user invests
                       materially less than their cluster peers, else None.
    """
    income = profile['monthly_income_estimate']
    gaps = []
    for db_cat, feature_name in CATEGORY_FEATURE_MAP.items():
        # Never recommend cutting non-cuttable categories (investments are
        # savings; EMI & Loans are fixed; Healthcare is non-discretionary).
        if db_cat in NON_CUTTABLE_CATEGORIES:
            continue
        key = f'{feature_name}_pct'
        user_pct = profile[key]
        peer_pct = benchmark.get(key, 0.0)
        gap_pct = user_pct - peer_pct
        if gap_pct > GOAL_OVERSPEND_THRESHOLD:
            gaps.append((db_cat, {
                'user_pct':           round(user_pct, 4),
                'peer_pct':           round(peer_pct, 4),
                'gap_pct':            round(gap_pct, 4),
                'user_monthly_spend': round(user_pct * income, 2),
                'peer_monthly_spend': round(peer_pct * income, 2),
                'overspend_amount':   round(gap_pct * income, 2),
            }))
    gaps.sort(key=lambda x: x[1]['overspend_amount'], reverse=True)

    # Investment insight: surface a positive opportunity when user invests
    # materially less than peers — only relevant when the gap exceeds the
    # threshold (avoids noise for rounding-level differences).
    investment_insight: Optional[str] = None
    inv_feature = CATEGORY_FEATURE_MAP.get('Investments', 'investments')
    inv_key = f'{inv_feature}_pct'
    user_inv_pct = profile.get(inv_key, 0.0)
    peer_inv_pct = benchmark.get(inv_key, 0.0)
    under_invest_pct = peer_inv_pct - user_inv_pct   # positive = user is below benchmark
    if under_invest_pct > INVESTMENT_INSIGHT_THRESHOLD:
        user_monthly_inv = round(user_inv_pct * income, 0)
        peer_monthly_inv = round(peer_inv_pct * income, 0)
        gap_amount = round(under_invest_pct * income, 0)
        investment_insight = (
            f"Users like you invest \u20b9{peer_monthly_inv:,.0f}/month on average. "
            f"You invest \u20b9{user_monthly_inv:,.0f}/month \u2014 consider increasing by "
            f"\u20b9{gap_amount:,.0f}/month to build long-term wealth."
        )

    return gaps, investment_insight


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 -- Predict elasticity (Model 2)
# ─────────────────────────────────────────────────────────────────────────────
def predict_elasticity(
    profile: dict,
    gaps: list[tuple[str, dict]],
    elasticity_model,
    elasticity_scaler,
) -> dict[str, float]:
    if not gaps:
        return {}
    income = profile['monthly_income_estimate']
    bracket_encoded = _income_bracket_encoded(income)
    volatility = profile['spend_volatility_normalised']
    months_by_cat = profile.get('_months_by_category', {})
    rows = []
    for db_cat, gap_info in gaps:
        rows.append([
            gap_info['user_monthly_spend'],
            gap_info['user_pct'] / max(gap_info['peer_pct'], 0.001),
            volatility,
            bracket_encoded,
            CATEGORY_TYPE.get(db_cat, 0.5),
            months_by_cat.get(db_cat, 6),
        ])
    X = pd.DataFrame(rows, columns=ELASTICITY_FEATURE_ORDER)
    X_scaled = elasticity_scaler.transform(X)
    preds = np.clip(elasticity_model.predict(X_scaled), 0.0, 0.50)
    return {db_cat: float(preds[i]) for i, (db_cat, _) in enumerate(gaps)}


# ─────────────────────────────────────────────────────────────────────────────
# Step 6 -- Rank recommendations (Model 3)
# ─────────────────────────────────────────────────────────────────────────────
def rank_recommendations(
    profile: dict,
    gaps: list[tuple[str, dict]],
    elasticity_pcts: dict[str, float],
    goal_months: int,
    gap_to_goal: float,
    ranker_model,
) -> list[tuple[str, dict, float]]:
    if not gaps:
        return []
    spend_amounts = {db_cat: gap_info['user_monthly_spend'] for db_cat, gap_info in gaps}
    sorted_cats = sorted(spend_amounts, key=spend_amounts.get, reverse=True)
    priority_rank = {cat: rank + 1 for rank, cat in enumerate(sorted_cats)}
    rows = []
    meta = []
    for db_cat, gap_info in gaps:
        reduction_pct = elasticity_pcts.get(db_cat, 0.10)
        monthly_saving = gap_info['user_monthly_spend'] * reduction_pct
        rows.append([
            monthly_saving,
            gap_info['user_pct'] / max(gap_info['peer_pct'], 0.001),
            CATEGORY_ACCEPTANCE_RATE.get(db_cat, 0.35),
            0,
            goal_months,
            gap_to_goal,
            priority_rank[db_cat],
            CATEGORY_TYPE.get(db_cat, 0.5),
        ])
        meta.append((db_cat, gap_info, monthly_saving))
    X = np.array(rows, dtype=float)
    scores = ranker_model.predict(X)
    ranked = sorted(zip(scores, meta), key=lambda x: -x[0])
    return [(db_cat, gap_info, monthly_saving) for _, (db_cat, gap_info, monthly_saving) in ranked]


# ─────────────────────────────────────────────────────────────────────────────
# Step 7 -- Allocate cutbacks
# ─────────────────────────────────────────────────────────────────────────────
def allocate_cutbacks(
    ranked: list[tuple[str, dict, float]],
    shortfall: float,
) -> tuple[list[CategoryCutback], float]:
    recommendations = []
    remaining = shortfall
    for db_cat, gap_info, max_monthly_saving in ranked:
        if remaining <= 0:
            break
        cut = min(max_monthly_saving, remaining)
        recommendations.append(CategoryCutback(
            category=db_cat,
            current_monthly_spend=gap_info['user_monthly_spend'],
            recommended_monthly_spend=round(gap_info['user_monthly_spend'] - cut, 2),
            monthly_saving=round(cut, 2),
            peer_avg_monthly_spend=gap_info['peer_monthly_spend'],
        ))
        remaining -= cut
    covered = shortfall - max(remaining, 0.0)
    return recommendations, round(covered, 2)


# ─────────────────────────────────────────────────────────────────────────────
# Cluster label
# ─────────────────────────────────────────────────────────────────────────────
def _cluster_label(benchmark: dict) -> str:
    income = benchmark['avg_income']
    savings = benchmark['avg_savings_rate']
    bracket = (
        'low income' if income < 30_000 else
        'medium income' if income < 75_000 else
        'high income' if income < 150_000 else
        'premium income'
    )
    saver = (
        'strong saver' if savings >= 0.20 else
        'moderate saver' if savings >= 0.10 else
        'tight budget'
    )
    return f'{bracket}, {saver}'


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrator: generate plan (POST /goals)
# ─────────────────────────────────────────────────────────────────────────────
def compute_goal_plan(
    user_id: str,
    goal_amount: float,
    goal_months: int,
    cluster_model,
    cluster_scaler,
    elasticity_model,
    elasticity_scaler,
    ranker_model,
    benchmarks: dict,
    conn,
    income_override: Optional[float] = None,
) -> GoalResponse:
    profile = build_user_profile(user_id, conn, income_override)
    cluster_id = assign_cluster(profile, cluster_model, cluster_scaler)
    benchmark = benchmarks[cluster_id]
    label = _cluster_label(benchmark)

    gaps, investment_insight = compute_gaps(profile, benchmark)

    income = profile['monthly_income_estimate']
    current_saving = profile['savings_rate'] * income

    # Subtract saving already committed to other saved goals
    committed_saving = get_committed_saving(user_id, conn)
    available_saving = max(current_saving - committed_saving, 0.0)

    required_saving = goal_amount / goal_months
    # Shortfall is against available saving, not total current saving
    shortfall = max(required_saving - available_saving, 0.0)
    gap_to_goal = shortfall

    elasticity_pcts = predict_elasticity(profile, gaps, elasticity_model, elasticity_scaler)
    ranked = rank_recommendations(profile, gaps, elasticity_pcts, goal_months, gap_to_goal, ranker_model)
    recommendations, covered = allocate_cutbacks(ranked, shortfall)

    achievable = covered >= shortfall * 0.95

    if shortfall <= 0:
        message = "Your available saving already covers this goal — no cutbacks needed."
    elif achievable:
        message = (
            f"By making these adjustments you can save an extra "
            f"Rs{covered:,.0f}/month, covering your full shortfall."
        )
    else:
        message = (
            f"Optimising your overspending covers Rs{covered:,.0f} of the "
            f"Rs{shortfall:,.0f}/month shortfall. Consider extending your timeline "
            f"or a smaller initial goal to bridge the remaining Rs{shortfall - covered:,.0f}/month."
        )

    logger.info(
        "[goal_service] user=%s cluster=%d current=%.0f committed=%.0f available=%.0f "
        "shortfall=%.0f covered=%.0f recs=%d income_override=%s",
        user_id, cluster_id, current_saving, committed_saving, available_saving,
        shortfall, covered, len(recommendations), income_override,
    )

    return GoalResponse(
        cluster_id=cluster_id,
        cluster_label=label,
        monthly_income_estimate=round(income, 2),
        current_monthly_saving=round(current_saving, 2),
        committed_monthly_saving=round(committed_saving, 2),
        available_monthly_saving=round(available_saving, 2),
        required_monthly_saving=round(required_saving, 2),
        shortfall=round(shortfall, 2),
        achievable_from_overspend=achievable,
        covered_monthly_saving=covered,
        recommendations=recommendations,
        message=message,
        investment_insight=investment_insight,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Save a finalised plan (POST /goals/save)
# ─────────────────────────────────────────────────────────────────────────────
def save_goal_plan(user_id: str, payload, conn) -> str:
    """Inserts a goal plan into user_goals. Returns the new goal id."""
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO user_goals
            (user_id, goal_name, goal_amount, goal_months, required_monthly_saving,
             monthly_income_used, income_override, cluster_id, cluster_label,
             decisions, total_monthly_cutback)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            user_id,
            payload.goal_name,
            payload.goal_amount,
            payload.goal_months,
            payload.required_monthly_saving,
            payload.monthly_income_used,
            payload.income_override,
            payload.cluster_id,
            payload.cluster_label,
            json.dumps(payload.decisions),
            payload.total_monthly_cutback,
        ),
    )
    row = cursor.fetchone()
    goal_id = str(row['id'])
    logger.info("[goal_service] Saved goal id=%s user=%s name=%s", goal_id, user_id, payload.goal_name)
    return goal_id


# ─────────────────────────────────────────────────────────────────────────────
# Fetch saved goals with live on-track status (GET /goals)
# ─────────────────────────────────────────────────────────────────────────────
def _get_live_current_saving(user_id: str, conn) -> tuple[float, float, float]:
    """
    Quick live estimate of current monthly saving without running the full ML pipeline.
    Returns (saving, income, avg_spend). All three are 0.0 if insufficient data.
    """
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(ABS(amount)) AS total
        FROM transactions
        WHERE user_id = %s AND type = %s
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id, TRANSACTION_TYPE_DEBIT),
    )
    debit_rows = cursor.fetchall()
    if not debit_rows:
        return 0.0, 0.0, 0.0

    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS credit
        FROM transactions
        WHERE user_id = %s AND type = %s AND amount >= %s
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id, TRANSACTION_TYPE_CREDIT, INCOME_MIN_CREDIT_AMOUNT),
    )
    credit_rows = cursor.fetchall()
    if not credit_rows:
        return 0.0, 0.0, 0.0

    income = statistics.median(row['credit'] for row in credit_rows)
    avg_spend = sum(row['total'] for row in debit_rows) / len(debit_rows)
    saving = max(income - avg_spend, 0.0)
    return saving, income, avg_spend


def get_saved_goals(user_id: str, conn) -> SavedGoalListResponse:
    """
    Returns all saved goals for the user, each annotated with a live on-track status.

    Goals are ordered by created_at. Available saving is allocated greedily in that
    order so that multi-goal shortfalls are surfaced correctly.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, goal_name, goal_amount, goal_months, required_monthly_saving,
               monthly_income_used, income_override, cluster_id, cluster_label,
               decisions, total_monthly_cutback,
               TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at
        FROM user_goals
        WHERE user_id = %s
        ORDER BY created_at ASC
        """,
        (user_id,),
    )
    rows = cursor.fetchall()

    live_saving, live_income, live_avg_spend = _get_live_current_saving(user_id, conn)

    # If the user has ever set an income override on any goal, use the most recent
    # one so the snapshot card stays consistent with what they entered.
    # rows are ASC by created_at so we scan in reverse to find the latest override.
    income_override_value: Optional[float] = None
    for row in reversed(rows):
        if row['income_override'] is not None:
            income_override_value = float(row['income_override'])
            break

    if income_override_value is not None:
        display_income = income_override_value
        effective_saving = max(income_override_value - live_avg_spend, 0.0)
    else:
        display_income = live_income
        effective_saving = live_saving

    remaining = effective_saving
    total_required = sum(float(r['required_monthly_saving']) for r in rows)
    total_cutback = sum(float(r['total_monthly_cutback']) for r in rows)

    goals: list[SavedGoal] = []
    for row in rows:
        req = float(row['required_monthly_saving'])
        allocated = min(remaining, req)
        remaining = max(0.0, remaining - req)

        pct = int(allocated / req * 100) if req > 0 else 100
        if pct >= 95:
            rag = 'on_track'
        elif pct >= 50:
            rag = 'at_risk'
        else:
            rag = 'off_track'

        decisions = row['decisions']
        if isinstance(decisions, str):
            decisions = json.loads(decisions)

        goals.append(SavedGoal(
            id=str(row['id']),
            goal_name=row['goal_name'],
            goal_amount=float(row['goal_amount']),
            goal_months=row['goal_months'],
            required_monthly_saving=req,
            monthly_income_used=float(row['monthly_income_used']),
            income_override=float(row['income_override']) if row['income_override'] else None,
            cluster_id=row['cluster_id'],
            cluster_label=row['cluster_label'],
            decisions=decisions,
            total_monthly_cutback=float(row['total_monthly_cutback']),
            created_at=row['created_at'],
            coverage_amount=round(allocated, 2),
            coverage_percent=pct,
            status=rag,
        ))

    return SavedGoalListResponse(
        goals=goals,
        current_monthly_saving=round(effective_saving, 2),
        monthly_income_estimate=round(display_income, 2),
        avg_monthly_spend=round(live_avg_spend, 2),
        total_required_monthly_saving=round(total_required, 2),
        total_committed_cutback=round(total_cutback, 2),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Delete a saved goal (DELETE /goals/{id})
# ─────────────────────────────────────────────────────────────────────────────
def delete_goal(user_id: str, goal_id: str, conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM user_goals WHERE id = %s AND user_id = %s RETURNING id",
        (goal_id, user_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Goal {goal_id} not found.",
        )
    logger.info("[goal_service] Deleted goal id=%s user=%s", goal_id, user_id)
