"""
Local inference test — no backend, no UI, no database.

Simulates what will happen at runtime when a real user submits their spending:
  1. Build a user profile from raw numbers
  2. Load the trained model artifacts
  3. Assign the user to a cluster
  4. Read their cluster's benchmark profile
  5. Compute the gap (where they overspend vs peers)
  6. Recommend category cutbacks to hit a savings goal

Usage:
    cd finsight-ml
    venv/Scripts/python evaluation/test_inference.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')

FEATURE_ORDER = [
    'monthly_income_estimate',
    'food_pct',
    'groceries_pct',
    'transport_pct',
    'entertainment_pct',
    'shopping_pct',
    'trip_pct',
    'education_pct',
    'utilities_pct',
    'health_pct',
    'investments_pct',
    'rent_pct',
    'savings_rate',
    'spend_volatility_normalised',
]

CATEGORY_FEATURES = [
    'food_pct', 'groceries_pct', 'transport_pct',
    'entertainment_pct', 'shopping_pct', 'trip_pct', 'education_pct',
    'utilities_pct', 'health_pct', 'investments_pct', 'rent_pct',
]

# Categories that are less painful to cut (purely heuristic ordering)
# Used to prioritise which cuts to recommend first
CUT_PRIORITY = [
    'trip_pct',            # fully discretionary — holidays, hotel stays
    'shopping_pct',        # highly discretionary — e-commerce, retail
    'entertainment_pct',   # highly discretionary — streaming, movies, events
    'education_pct',       # semi — can be deferred
    'food_pct',            # semi — reduce eating out, keep home cooking
    'groceries_pct',       # mostly essential
    'transport_pct',       # semi — reduce Uber/cabs, keep commute
    'utilities_pct',       # largely fixed but some flexibility
    'health_pct',          # non-discretionary — rarely recommended
    'investments_pct',     # last — cutting investments harms future wealth
    'rent_pct',            # non-negotiable fixed obligation
]


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Build user profile from raw transaction data
#
# In production this comes from the DB. Here we hardcode three test personas.
# ─────────────────────────────────────────────────────────────────────────────
TEST_USERS = {
    'Priya (medium income, dining-heavy)': {
        'monthly_income': 55000,
        'monthly_spend_by_category': {
            'food':          12000,   # 22% — above peers
            'groceries':     5000,
            'transport':     5500,
            'entertainment': 3000,
            'shopping':      4000,
            'trip':          1000,
            'education':     500,
            'utilities':     5000,
            'health':        1500,
            'investments':   2000,
            'rent':          8000,
        },
    },
    'Rahul (high income, shop-heavy)': {
        'monthly_income': 120000,
        'monthly_spend_by_category': {
            'food':          10000,
            'groceries':     7000,
            'transport':     10000,
            'entertainment': 8000,
            'shopping':      22000,   # very high shopping
            'trip':          8000,
            'education':     2000,
            'utilities':     8000,
            'health':        4000,
            'investments':   20000,
            'rent':          12000,
        },
    },
    'Meera (low income, stretched)': {
        'monthly_income': 22000,
        'monthly_spend_by_category': {
            'food':          5500,
            'groceries':     3000,
            'transport':     2500,
            'entertainment': 500,
            'shopping':      1000,
            'trip':          0,
            'education':     0,
            'utilities':     3500,
            'health':        2000,
            'investments':   0,
            'rent':          4000,
        },
    },
}


def build_profile(monthly_income: float, spend_by_category: dict) -> dict:
    """Convert raw amounts into the 14-feature vector the model expects."""
    total_spend = sum(spend_by_category.values())
    savings = monthly_income - total_spend

    profile = {'monthly_income_estimate': monthly_income}
    for cat in CATEGORY_FEATURES:
        key = cat.replace('_pct', '')   # 'food_pct' -> 'food'
        amount = spend_by_category.get(key, 0)
        profile[cat] = amount / monthly_income

    profile['savings_rate'] = savings / monthly_income

    # Volatility: not derivable from a single month snapshot.
    # At inference time this comes from std(monthly_totals) / income over DB history.
    # For this test we use the income-bracket heuristic midpoints.
    if monthly_income < 30000:
        profile['spend_volatility_normalised'] = 0.22
    elif monthly_income < 75000:
        profile['spend_volatility_normalised'] = 0.14
    elif monthly_income < 150000:
        profile['spend_volatility_normalised'] = 0.09
    else:
        profile['spend_volatility_normalised'] = 0.06

    return profile


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Load artifacts
# ─────────────────────────────────────────────────────────────────────────────
def load_artifacts():
    model = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_model.pkl'))
    scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_scaler.pkl'))
    with open(os.path.join(ARTIFACTS_DIR, 'cluster_benchmarks.json')) as f:
        benchmarks = json.load(f)
    # JSON keys are strings — convert to int
    benchmarks = {int(k): v for k, v in benchmarks.items()}
    return model, scaler, benchmarks


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 -- Assign cluster
# ─────────────────────────────────────────────────────────────────────────────
def assign_cluster(profile: dict, model, scaler) -> int:
    feature_vector = pd.DataFrame([[profile[f] for f in FEATURE_ORDER]], columns=FEATURE_ORDER)
    scaled = scaler.transform(feature_vector)
    cluster_id = int(model.predict(scaled)[0])
    return cluster_id


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 -- Compute overspend gaps vs cluster benchmark
# ─────────────────────────────────────────────────────────────────────────────
def compute_gaps(profile: dict, benchmark: dict) -> dict:
    """
    Returns categories where user spends MORE than cluster peers.
    Gap is expressed both as a percentage-point difference and as a monthly amount.
    """
    income = profile['monthly_income_estimate']
    gaps = {}
    for cat in CATEGORY_FEATURES:
        user_pct = profile[cat]
        peer_pct = benchmark[cat]
        diff_pct = user_pct - peer_pct   # positive = overspending
        if diff_pct > 0.005:             # ignore sub-0.5% gaps (noise)
            gaps[cat] = {
                'user_pct':   round(user_pct, 4),
                'peer_pct':   round(peer_pct, 4),
                'gap_pct':    round(diff_pct, 4),
                'gap_amount': round(diff_pct * income, 2),
            }
    return gaps


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 -- Recommend cutbacks to hit savings goal
# ─────────────────────────────────────────────────────────────────────────────
def recommend_cutbacks(
    profile: dict,
    gaps: dict,
    goal_amount: float,
    goal_months: int,
) -> list[dict]:
    """
    Given a savings goal and a deadline, work out which categories to cut
    and by how much.

    Strategy:
    - Required monthly saving = goal_amount / goal_months
    - Current monthly saving  = savings_rate * income
    - Shortfall               = required - current
    - Allocate the shortfall across overspending categories in priority order,
      capped at the overspend gap (we never recommend cutting below peer average)
    """
    income = profile['monthly_income_estimate']
    current_monthly_saving = profile['savings_rate'] * income
    required_monthly_saving = goal_amount / goal_months
    shortfall = required_monthly_saving - current_monthly_saving

    if shortfall <= 0:
        return []   # already on track — no cuts needed

    recommendations = []
    remaining = shortfall

    for cat in CUT_PRIORITY:
        if remaining <= 0:
            break
        if cat not in gaps:
            continue

        gap = gaps[cat]
        # Cut up to the full gap, but no more (don't recommend below peer average)
        cut_amount = min(gap['gap_amount'], remaining)
        cut_pct_of_income = cut_amount / income

        recommendations.append({
            'category': cat.replace('_pct', ''),
            'current_monthly_spend': round(profile[cat] * income, 2),
            'recommended_monthly_spend': round((profile[cat] - cut_pct_of_income) * income, 2),
            'monthly_saving': round(cut_amount, 2),
            'vs_peer_avg': round(gap['peer_pct'] * income, 2),
        })
        remaining -= cut_amount

    return recommendations, round(shortfall - max(remaining, 0), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────
def run_test(name: str, user_data: dict, goal_amount: float, goal_months: int,
             model, scaler, benchmarks) -> None:
    print("\n" + "=" * 70)
    print("USER: {}".format(name))
    print("GOAL: Save Rs{:,.0f} in {} months (Rs{:,.0f}/month needed)".format(
        goal_amount, goal_months, goal_amount / goal_months))
    print("=" * 70)

    profile = build_profile(user_data['monthly_income'], user_data['monthly_spend_by_category'])
    cluster_id = assign_cluster(profile, model, scaler)
    benchmark = benchmarks[cluster_id]

    income = profile['monthly_income_estimate']
    current_saving = profile['savings_rate'] * income

    print("\nProfile:")
    print("  Income:          Rs{:>10,.0f}".format(income))
    print("  Current savings: Rs{:>10,.0f}/month  ({:.1%} of income)".format(
        current_saving, profile['savings_rate']))
    print("  Assigned cluster: {} (avg income Rs{:,.0f}, avg savings {:.1%})".format(
        cluster_id, benchmark['avg_income'], benchmark['avg_savings_rate']))

    gaps = compute_gaps(profile, benchmark)

    if gaps:
        print("\nOverspend vs cluster peers:")
        print("  {:<20} {:>10} {:>10} {:>12}".format(
            "Category", "You", "Peers", "Gap/month"))
        print("  " + "-" * 56)
        for cat, g in sorted(gaps.items(), key=lambda x: -x[1]['gap_amount']):
            print("  {:<20} {:>9.1%} {:>9.1%} Rs{:>9,.0f}".format(
                cat.replace('_pct', ''),
                g['user_pct'],
                g['peer_pct'],
                g['gap_amount'],
            ))
    else:
        print("\nNo significant overspend vs cluster peers.")

    result = recommend_cutbacks(profile, gaps, goal_amount, goal_months)
    if isinstance(result, tuple):
        recs, covered = result
    else:
        recs, covered = result, 0

    required = goal_amount / goal_months
    shortfall = required - current_saving

    if shortfall <= 0:
        print("\nAlready on track -- no cutbacks needed.")
        return

    print("\nRecommended cutbacks (shortfall Rs{:,.0f}/month):".format(shortfall))
    if not recs:
        print("  Cannot cover shortfall from overspend alone -- need income increase.")
        return

    print("  {:<20} {:>12} {:>12} {:>12}".format(
        "Category", "Current", "Target", "Save/month"))
    print("  " + "-" * 60)
    for r in recs:
        print("  {:<20} Rs{:>9,.0f}  Rs{:>9,.0f}  Rs{:>9,.0f}".format(
            r['category'],
            r['current_monthly_spend'],
            r['recommended_monthly_spend'],
            r['monthly_saving'],
        ))
    print("  " + "-" * 60)
    print("  {:<20} {:>23}  Rs{:>9,.0f}  (of Rs{:,.0f} needed)".format(
        "TOTAL", "", covered, shortfall))


if __name__ == '__main__':
    model, scaler, benchmarks = load_artifacts()

    # Test all three personas against the same goal
    for name, user_data in TEST_USERS.items():
        run_test(
            name=name,
            user_data=user_data,
            goal_amount=150_000,    # Rs 1,50,000 Europe trip
            goal_months=12,         # by December 2026
            model=model,
            scaler=scaler,
            benchmarks=benchmarks,
        )
