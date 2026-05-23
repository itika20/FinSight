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
from datetime import datetime
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
    INVESTMENT_INSIGHT_THRESHOLD,
    LOGGER_GOALS,
    NON_CUTTABLE_CATEGORIES,
    SALARY_SHIFT_DAY,
    TRANSACTION_TYPE_DEBIT,
)
from app.schemas.goals import CategoryCutback, CategoryDrift, GoalResponse, SavedGoal, SavedGoalListResponse, MonthlyContribution, GoalTracking

logger = logging.getLogger(LOGGER_GOALS)

# ─────────────────────────────────────────────────────────────────────────────
# Feature orders — must match finsight-ml training exactly
# ─────────────────────────────────────────────────────────────────────────────
CLUSTER_FEATURE_ORDER = [
    'monthly_income_estimate',
    'food_pct', 'groceries_pct', 'transport_pct', 'shopping_pct',
    'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct',
    'savings_rate', 'spend_volatility_normalised',
]  # Must match training_data.csv columns exactly — 12 features

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
    'Trip':          1.00,  # fully discretionary: holidays, hotels
    'Shopping':      0.95,  # highly discretionary: e-commerce, retail
    'Entertainment': 0.90,  # highly discretionary: streaming, movies, events
    'Education':     0.30,  # semi: can be deferred
    'Food':          0.50,  # partial: reduce eating out, keep home cooking
    'Groceries':     0.20,  # mostly essential
    'Transport':     0.40,  # partial: reduce Uber/cabs, keep commute essentials
    'Utilities':     0.10,  # largely fixed bills
    'Health':        0.05,  # non-discretionary
    'Investments':   0.30,  # can temporarily reduce
    'Rent':          0.00,  # fixed obligation
}

CATEGORY_ACCEPTANCE_RATE = {
    'Trip':          0.60,
    'Shopping':      0.70,
    'Entertainment': 0.65,
    'Education':     0.35,
    'Food':          0.45,
    'Groceries':     0.30,
    'Transport':     0.38,
    'Utilities':     0.20,
    'Health':        0.12,
    'Investments':   0.20,
    'Rent':          0.05,
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

    # Net spend per category = MAX(0, debits − credits).
    # Credits in a category represent flatmate reimbursements or refunds
    # (e.g. flatmate pays their rent share, categorised as Rent) and correctly
    # reduce the user's actual share of that expense.
    # Transfers and Salary are excluded — Transfers are pass-throughs, Salary is income.
    # Credits in expense categories (flatmate reimbursements) net against debits.
    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               category,
               GREATEST(0,
                 SUM(CASE WHEN type = 'debit'  THEN ABS(amount) ELSE 0 END) -
                 SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END)
               ) AS monthly_amount
        FROM transactions
        WHERE user_id = %s AND category IS NOT NULL
          AND category NOT IN ('Transfers', 'Salary')
        GROUP BY TO_CHAR(date, 'YYYY-MM'), category
        """,
        (user_id,),
    )
    debit_rows = cursor.fetchall()

    # Total net spend per month (same netting logic, all expense categories)
    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               GREATEST(0,
                 SUM(CASE WHEN type = 'debit'  THEN ABS(amount) ELSE 0 END) -
                 SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END)
               ) AS monthly_total
        FROM transactions
        WHERE user_id = %s AND category NOT IN ('Transfers', 'Salary')
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id,),
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
        # Income = non-Transfer credits above the minimum threshold.
        # Only transactions explicitly tagged as 'Salary' count as income.
        # This eliminates false positives from large refunds, FD payouts,
        # or flatmate reimbursements that exceed any amount threshold.
        cursor.execute(
            """
            SELECT
              TO_CHAR(date, 'YYYY-MM') AS month,
              SUM(CASE
                WHEN category = 'Salary' THEN amount ELSE 0
              END) AS regular_income
            FROM transactions
            WHERE user_id = %s
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            """,
            (user_id,),
        )
        credit_rows = cursor.fetchall()
        # Only include months where a Salary credit actually landed.
        # Months with no Salary tag contribute ₹0 to the raw query, but
        # including them in the median pulls the estimate down sharply —
        # e.g. [₹1L, ₹0, ₹0] → median ₹0 → spurious 422.
        monthly_credits = [
            float(row['regular_income'])
            for row in credit_rows
            if float(row['regular_income']) > 0
        ]
        if not monthly_credits:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=ERROR_INCOME_UNKNOWN,
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
    # fuel_pct is in the trained cluster model but has no current DB category —
    # default to 0 so the feature vector is complete.
    profile['fuel_pct'] = 0.0
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
# Helper: total accumulated investment savings for the user
# ─────────────────────────────────────────────────────────────────────────────
def _get_accumulated_savings(user_id: str, conn) -> float:
    """
    Sum of all Investments-category debit transactions (absolute value).
    This is the user's total savings pot at a point in time — snapshotted
    at goal-creation and stored so the progress bar is stable over time.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COALESCE(SUM(ABS(amount)), 0.0) AS total
        FROM transactions
        WHERE user_id = %s AND type = %s AND category = 'Investments'
        """,
        (user_id, TRANSACTION_TYPE_DEBIT),
    )
    return float(cursor.fetchone()['total'])


# ─────────────────────────────────────────────────────────────────────────────
# Save a finalised plan (POST /goals/save)
# ─────────────────────────────────────────────────────────────────────────────
def save_goal_plan(user_id: str, payload, conn) -> str:
    """
    Inserts a goal plan into user_goals.
    Snapshots accumulated_savings_at_creation from current Investments transactions.
    Returns the new goal id.
    """
    accumulated_savings = _get_accumulated_savings(user_id, conn)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO user_goals
            (user_id, goal_name, goal_amount, goal_months, required_monthly_saving,
             monthly_income_used, income_override, cluster_id, cluster_label,
             decisions, total_monthly_cutback,
             accumulated_savings_at_creation, count_existing_savings,
             baselines)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            accumulated_savings,
            False,
            json.dumps(payload.baselines),
        ),
    )
    row = cursor.fetchone()
    goal_id = str(row['id'])
    logger.info(
        "[goal_service] Saved goal id=%s user=%s name=%s accumulated_savings=%.0f",
        goal_id, user_id, payload.goal_name, accumulated_savings,
    )
    return goal_id


# ─────────────────────────────────────────────────────────────────────────────
# Toggle existing-savings flag (PATCH /goals/{id}/existing-savings)
# ─────────────────────────────────────────────────────────────────────────────
def toggle_existing_savings(user_id: str, goal_id: str, count_existing: bool, conn) -> None:
    """
    Flips count_existing_savings for a goal.

    Enforces a one-goal-at-a-time constraint: when turning ON, any other goal
    for this user that already has count_existing_savings=TRUE is turned OFF first
    so only the new goal is counting.

    Raises 404 if not found / wrong owner.
    """
    cursor = conn.cursor()
    if count_existing:
        # Only one goal may count existing savings at a time — turn off any other.
        cursor.execute(
            """
            UPDATE user_goals
            SET count_existing_savings = FALSE
            WHERE user_id = %s AND id != %s AND count_existing_savings = TRUE
            """,
            (user_id, goal_id),
        )
    cursor.execute(
        """
        UPDATE user_goals
        SET count_existing_savings = %s
        WHERE id = %s AND user_id = %s
        RETURNING id
        """,
        (count_existing, goal_id, user_id),
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found.")


def recalculate_savings(user_id: str, goal_id: str, conn) -> float:
    """
    Re-snaps accumulated_savings_at_creation from the user's current Investments
    transactions and stores the updated value.  Used when a goal was created before
    the accumulated_savings column existed (value would be 0).

    Returns the newly computed savings amount.
    Raises 404 if the goal is not found / wrong owner.
    """
    accumulated = _get_accumulated_savings(user_id, conn)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE user_goals
        SET accumulated_savings_at_creation = %s
        WHERE id = %s AND user_id = %s
        RETURNING id
        """,
        (accumulated, goal_id, user_id),
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found.")
    logger.info(
        "[goal_service] Recalculated savings id=%s user=%s accumulated=%.0f",
        goal_id, user_id, accumulated,
    )
    return accumulated


# ─────────────────────────────────────────────────────────────────────────────
# Plan-adherence tracking (month-by-month contributions per goal)
# ─────────────────────────────────────────────────────────────────────────────

def _month_offset(ym: str, offset: int) -> str:
    """Return 'YYYY-MM' string shifted by `offset` months (negative = earlier)."""
    y, m = map(int, ym.split('-'))
    total = y * 12 + (m - 1) + offset
    return f'{total // 12:04d}-{total % 12 + 1:02d}'


def _compute_pooled_tracking(conn, user_id: str, goal_infos: list[dict]) -> dict:
    """
    Plan-adherence tracking: for each month since goal creation, compute
    how much of the committed spending plan the user actually followed.

    For each accepted/modified decision category:
        cat_contribution = min(max(0, baseline_spend - actual_spend), decision_cutback)
    monthly_contribution = sum(cat_contributions), capped at required_monthly_saving.

    baseline_spend = avg monthly spend in that category in the 3 months before
    goal creation (or fewer months if statement history is shorter).

    Falls back to max(0, net_surplus) capped at required_monthly_saving when the
    goal has no accepted decisions (all skipped).

    net_surplus and total_invested are computed alongside as informational fields
    displayed in the UI monthly breakdown — they are not used in the calculation.

    goal_infos keys: id, created_at (YYYY-MM-DD), required_monthly_saving,
                     goal_amount, decisions ({category: {amount, status}})
    Returns {goal_id_str: GoalTracking}.
    """
    if not goal_infos:
        return {}

    earliest_month = min(g['created_at'][:7] for g in goal_infos)  # 'YYYY-MM'
    # Fetch category spend from 3 months before the earliest goal to cover baselines.
    window_start = _month_offset(earliest_month, -3)
    cursor = conn.cursor()

    # All category net spend by month (covers both pre-goal baseline and tracking periods).
    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               category,
               GREATEST(0,
                 SUM(CASE WHEN type = 'debit'  THEN ABS(amount) ELSE 0 END) -
                 SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END)
               ) AS net_spend
        FROM transactions
        WHERE user_id = %s
          AND TO_CHAR(date, 'YYYY-MM') >= %s
          AND category NOT IN ('Transfers', 'Salary')
        GROUP BY TO_CHAR(date, 'YYYY-MM'), category
        ORDER BY month ASC
        """,
        (user_id, window_start),
    )
    spend_by_month: dict[str, dict[str, float]] = {}
    for row in cursor.fetchall():
        spend_by_month.setdefault(row['month'], {})[row['category']] = float(row['net_spend'])

    # Net expenses per calendar month — informational display only.
    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               GREATEST(0,
                 SUM(CASE WHEN type = 'debit'  AND category NOT IN ('Transfers','Salary')
                          THEN ABS(amount) ELSE 0 END) -
                 SUM(CASE WHEN type = 'credit' AND category NOT IN ('Transfers','Salary')
                          THEN ABS(amount) ELSE 0 END)
               ) AS net_expenses
        FROM transactions
        WHERE user_id = %s
          AND TO_CHAR(date, 'YYYY-MM') >= %s
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month ASC
        """,
        (user_id, earliest_month),
    )
    expense_rows: dict[str, float] = {row['month']: float(row['net_expenses']) for row in cursor.fetchall()}

    # Salary income with month-shift: salary arriving on day >= SALARY_SHIFT_DAY
    # funds the NEXT month's spending (e.g. March-28 salary → April income).
    # Window starts one month before earliest_month to catch shifted salary that
    # belongs to earliest_month itself.
    salary_window_start = _month_offset(earliest_month, -1)
    cursor.execute(
        """
        SELECT
          CASE
            WHEN EXTRACT(DAY FROM date) >= %s
            THEN TO_CHAR(date + INTERVAL '1 month', 'YYYY-MM')
            ELSE TO_CHAR(date, 'YYYY-MM')
          END AS income_month,
          SUM(ABS(amount)) AS salary_income
        FROM transactions
        WHERE user_id = %s
          AND TO_CHAR(date, 'YYYY-MM') >= %s
          AND category = 'Salary'
          AND type = 'credit'
        GROUP BY 1
        ORDER BY 1
        """,
        (SALARY_SHIFT_DAY, user_id, salary_window_start),
    )
    salary_income_rows: dict[str, float] = {row['income_month']: float(row['salary_income']) for row in cursor.fetchall()}

    # Merge into a single surplus_rows dict keyed by calendar month.
    all_surplus_months = set(expense_rows.keys()) | set(salary_income_rows.keys())
    surplus_rows = {
        m: {
            'salary_income': salary_income_rows.get(m, 0.0),
            'net_expenses':  expense_rows.get(m, 0.0),
        }
        for m in all_surplus_months
    }

    _salary_values = list(salary_income_rows.values())
    _income_median = statistics.median(_salary_values) if _salary_values else 0.0

    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               SUM(ABS(amount)) AS total_invested
        FROM transactions
        WHERE user_id = %s
          AND TO_CHAR(date, 'YYYY-MM') >= %s
          AND category = 'Investments' AND type = 'debit'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month ASC
        """,
        (user_id, earliest_month),
    )
    invest_rows = {row['month']: float(row['total_invested']) for row in cursor.fetchall()}

    # All months that have any transaction data (used for gap detection).
    months_with_data = set(surplus_rows.keys()) | set(invest_rows.keys()) | set(spend_by_month.keys())
    current_ym = datetime.now().strftime('%Y-%m')

    result = {}
    for g in goal_infos:
        goal_month = g['created_at'][:7]
        req = g['required_monthly_saving']
        goal_amount = g['goal_amount']
        decisions = g.get('decisions', {})

        # Extract accepted/modified decisions: {category: cutback_amount}
        accepted: dict[str, float] = {
            cat: float(dec['amount'])
            for cat, dec in decisions.items()
            if dec.get('status') != 'skipped' and float(dec.get('amount', 0)) > 0
        }

        # Baseline: avg monthly spend per category in the 3 months before goal creation.
        # Only include months that actually have transaction data (ignore upload gaps).
        pre_months = [_month_offset(goal_month, -i) for i in range(1, 4)]
        baseline: dict[str, float] = {}
        for cat in accepted:
            samples = [
                spend_by_month[pm].get(cat, 0.0)
                for pm in pre_months
                if pm in spend_by_month
            ]
            baseline[cat] = statistics.mean(samples) if samples else 0.0

        # Build the full calendar range from goal creation to today (inclusive).
        # Gap months (no uploads) get status='gap' and are excluded from the
        # elapsed count and cumulative calculations.
        full_range: list[str] = []
        ym = goal_month
        while ym <= current_ym:
            full_range.append(ym)
            ym = _month_offset(ym, 1)

        monthly = []
        for month in full_range:
            has_data = month in months_with_data

            if not has_data and month < current_ym:
                # Past month with no uploaded transactions — surface as a gap.
                monthly.append(MonthlyContribution(
                    month=month,
                    net_surplus=0.0,
                    total_invested=0.0,
                    contribution=0.0,
                    target=round(req, 2),
                    status='gap',
                ))
                continue

            if not has_data:
                # Current in-progress month with no data yet — skip entirely.
                continue

            # Informational net surplus (smoothed salary).
            s = surplus_rows.get(month)
            if s:
                raw_salary = float(s['salary_income'])
                smoothed = min(raw_salary, _income_median) if raw_salary > 0 else 0.0
                net_surplus = smoothed - float(s['net_expenses'])
            else:
                net_surplus = 0.0
            invested = invest_rows.get(month, 0.0)

            # Plan-adherence contribution.
            if accepted:
                month_spend = spend_by_month.get(month, {})
                contribution = 0.0
                for cat, cutback in accepted.items():
                    base = baseline.get(cat, 0.0)
                    actual = month_spend.get(cat, 0.0)
                    contribution += min(max(0.0, base - actual), cutback)
                # Cap at required_monthly_saving — over-performance on one category
                # cannot offset a different goal's shortfall.
                contribution = min(contribution, req)
            else:
                # All decisions skipped — fall back to net surplus as a proxy.
                contribution = max(0.0, min(net_surplus, req))

            if contribution >= req:
                month_status = 'ahead'
            elif contribution >= req * 0.8:
                month_status = 'on_track'
            else:
                month_status = 'behind'

            monthly.append(MonthlyContribution(
                month=month,
                net_surplus=round(net_surplus, 2),
                total_invested=round(invested, 2),
                contribution=round(contribution, 2),
                target=round(req, 2),
                status=month_status,
            ))

        # Exclude gap months from elapsed count and cumulative targets —
        # we can't measure adherence for months with no data.
        non_gap = [m for m in monthly if m.status != 'gap']
        cumulative = sum(m.contribution for m in non_gap)
        elapsed = len(non_gap)
        cum_target = elapsed * req
        progress_pct = min(100.0, cumulative / goal_amount * 100) if goal_amount > 0 else 0.0
        avg = cumulative / elapsed if elapsed > 0 else 0.0
        projected = round(goal_amount / avg, 1) if avg > 0 else None

        if elapsed == 0:
            overall = 'not_started'
        elif cumulative >= cum_target:
            overall = 'ahead'
        elif cumulative >= cum_target * 0.8:
            overall = 'on_track'
        else:
            overall = 'behind'

        result[g['id']] = GoalTracking(
            monthly=monthly,
            cumulative_contribution=round(cumulative, 2),
            cumulative_target=round(cum_target, 2),
            months_elapsed=elapsed,
            progress_pct=round(progress_pct, 1),
            overall_status=overall,
            avg_monthly_contribution=round(avg, 2),
            projected_months_to_goal=projected,
        )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Fetch saved goals with live on-track status (GET /goals)
# ─────────────────────────────────────────────────────────────────────────────
def _get_live_current_saving(user_id: str, conn) -> tuple[float, float, float]:
    """
    Quick live estimate of current monthly saving without running the full ML pipeline.
    Returns (saving, income, avg_spend). All three are 0.0 if insufficient data.
    """
    cursor = conn.cursor()

    # Total net spend per month — same netting logic as build_user_profile.
    # Credits in an expense category (e.g. flatmate reimbursements) reduce net spend.
    # Salary and Transfers are excluded: they are income/pass-throughs, not reimbursements.
    cursor.execute(
        """
        SELECT TO_CHAR(date, 'YYYY-MM') AS month,
               GREATEST(0,
                 SUM(CASE WHEN type = 'debit'  THEN ABS(amount) ELSE 0 END) -
                 SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END)
               ) AS total
        FROM transactions
        WHERE user_id = %s AND category NOT IN ('Transfers', 'Salary')
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id,),
    )
    debit_rows = cursor.fetchall()
    if not debit_rows:
        return 0.0, 0.0, 0.0

    # Income = only transactions explicitly tagged as 'Salary'.
    cursor.execute(
        """
        SELECT
          TO_CHAR(date, 'YYYY-MM') AS month,
          SUM(CASE
            WHEN category = 'Salary' THEN amount ELSE 0
          END) AS regular_income
        FROM transactions
        WHERE user_id = %s
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        """,
        (user_id,),
    )
    credit_rows = cursor.fetchall()
    if not credit_rows:
        return 0.0, 0.0, 0.0

    monthly_incomes = [float(row['regular_income']) for row in credit_rows]
    income = statistics.median(monthly_incomes)
    avg_spend = sum(row['total'] for row in debit_rows) / len(debit_rows)
    saving = max(income - avg_spend, 0.0)
    return saving, income, avg_spend


def _get_current_category_avgs(user_id: str, conn) -> dict[str, float]:
    """
    Returns avg monthly debit spend per category over the 3 complete months before now.
    Divides by the actual number of months present (not a hard-coded 3) so sparse
    data doesn't produce an artificially low average.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT category,
               SUM(amount)                                        AS total,
               COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM'))           AS n_months
        FROM transactions
        WHERE user_id = %s
          AND type = 'debit'
          AND category NOT IN ('Transfers', 'Salary')
          AND TO_CHAR(date, 'YYYY-MM') >= TO_CHAR(
                DATE_TRUNC('month', NOW()) - INTERVAL '3 months', 'YYYY-MM')
          AND TO_CHAR(date, 'YYYY-MM') < TO_CHAR(NOW(), 'YYYY-MM')
        GROUP BY category
        """,
        (user_id,),
    )
    rows = cursor.fetchall()
    return {
        row['category']: float(row['total']) / int(row['n_months'])
        for row in rows
        if int(row['n_months']) > 0
    }


def _get_latest_month_category_spend(user_id: str, conn) -> tuple[Optional[str], dict[str, float]]:
    """
    Returns the most recent month that has debit transaction data and the net spend
    per category for that month.

    Returns (month_str 'YYYY-MM', {category: total_spend}).
    Returns (None, {}) when the user has no qualifying transactions.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT TO_CHAR(MAX(date), 'YYYY-MM') AS latest_month
        FROM transactions
        WHERE user_id = %s
          AND type = 'debit'
          AND category NOT IN ('Transfers', 'Salary')
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    if not row or not row['latest_month']:
        return None, {}

    latest_month = row['latest_month']

    cursor.execute(
        """
        SELECT category, SUM(amount) AS total
        FROM transactions
        WHERE user_id = %s
          AND type = 'debit'
          AND category NOT IN ('Transfers', 'Salary')
          AND TO_CHAR(date, 'YYYY-MM') = %s
        GROUP BY category
        """,
        (user_id, latest_month),
    )
    rows = cursor.fetchall()
    return latest_month, {row['category']: float(row['total']) for row in rows}


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
               COALESCE(accumulated_savings_at_creation, 0) AS accumulated_savings_at_creation,
               COALESCE(count_existing_savings, FALSE)       AS count_existing_savings,
               TO_CHAR(created_at, 'YYYY-MM-DD') AS created_at,
               COALESCE(baselines, '{}')                     AS baselines
        FROM user_goals
        WHERE user_id = %s
        ORDER BY created_at ASC
        """,
        (user_id,),
    )
    rows = cursor.fetchall()

    current_cat_avgs = _get_current_category_avgs(user_id, conn)
    latest_month, latest_month_spend = _get_latest_month_category_spend(user_id, conn)

    # Build lightweight goal info for tracking computation
    goal_infos = [
        {
            'id': str(row['id']),
            'created_at': str(row['created_at']),
            'required_monthly_saving': float(row['required_monthly_saving']),
            'goal_amount': float(row['goal_amount']),
            'decisions': row['decisions'] if isinstance(row['decisions'], dict) else {},
        }
        for row in rows
    ]
    tracking_map = _compute_pooled_tracking(conn, user_id, goal_infos)

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

        # Use plan-adherence tracking status when the goal has at least one elapsed month.
        # Fall back to income-based allocation estimate only when tracking hasn't started.
        tracking_obj = tracking_map.get(str(row['id']))
        if tracking_obj and tracking_obj.overall_status != 'not_started':
            rag = 'on_track' if tracking_obj.overall_status in ('ahead', 'on_track') else 'off_track'
        else:
            if pct >= 95:
                rag = 'on_track'
            elif pct >= 50:
                rag = 'at_risk'
            else:
                rag = 'off_track'

        decisions = row['decisions']
        if isinstance(decisions, str):
            decisions = json.loads(decisions)

        baselines = row['baselines']
        if isinstance(baselines, str):
            baselines = json.loads(baselines)

        # Compute per-category spend drift for categories that have a stored baseline.
        # Only surface categories where spend has shifted by ≥20% — noise below that
        # isn't actionable and would clutter the UI.
        spend_drift: list[CategoryDrift] = []
        for cat, baseline_spend in (baselines or {}).items():
            if baseline_spend <= 0:
                continue
            current = current_cat_avgs.get(cat, 0.0)
            drift_pct = (current - baseline_spend) / baseline_spend * 100
            if abs(drift_pct) >= 20:
                spend_drift.append(CategoryDrift(
                    category=cat,
                    plan_baseline=round(baseline_spend, 2),
                    current_avg=round(current, 2),
                    drift_pct=round(drift_pct, 1),
                ))

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
            accumulated_savings_at_creation=float(row['accumulated_savings_at_creation']),
            count_existing_savings=bool(row['count_existing_savings']),
            created_at=row['created_at'],
            baselines=baselines or {},
            coverage_amount=round(allocated, 2),
            coverage_percent=pct,
            status=rag,
            tracking=tracking_map.get(str(row['id'])),
            spend_drift=spend_drift,
            current_month=latest_month,
            current_month_spend=latest_month_spend,
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
