"""
Synthetic training data generator for FinSight savings goal model.

Generates 5,000 synthetic Indian household spending profiles parameterised
from NSSO Household Consumer Expenditure Survey distributions.

Output: data/training_data.csv (5000 rows × 14 feature columns)

Usage:
    cd finsight-ml
    python data/generate_synthetic.py
"""

import numpy as np
import pandas as pd
import os

SEED = 42
np.random.seed(SEED)

# ─────────────────────────────────────────────────────────────────────────────
# Income ranges (monthly, INR)
# ─────────────────────────────────────────────────────────────────────────────
INCOME_RANGES = {
    'low':     (15_000,   30_000),
    'medium':  (30_000,   75_000),
    'high':    (75_000,  150_000),
    'premium': (150_000, 400_000),
}

# ─────────────────────────────────────────────────────────────────────────────
# Base spending proportions (mean, std) per income bracket.
#
# Derived from NSSO Household Consumer Expenditure Survey (HCE 2022-23).
# Categories mapped to FinSight taxonomy.
# Residual (1 - sum of means) falls into savings + categories not modelled
# as features (EMI, insurance, transfers, other).
# ─────────────────────────────────────────────────────────────────────────────
BASE_PROPORTIONS = {
    'low': {
        # NSSO: food+beverages ~45-50% for low-income urban households.
        # Split: ~60% restaurants/delivery, ~40% supermarkets/grocery delivery.
        'food':          (0.22, 0.06),  # restaurants, cafes, takeaway
        'groceries':     (0.16, 0.05),  # supermarkets, grocery delivery
        'transport':     (0.10, 0.03),  # includes fuel
        'utilities':     (0.15, 0.03),
        'health':        (0.07, 0.04),
        'entertainment': (0.03, 0.02),  # streaming, movies, events
        'shopping':      (0.02, 0.01),  # e-commerce, retail
        'trip':          (0.01, 0.01),  # hotels, holiday packages
        'education':     (0.01, 0.01),  # courses, tuition
        'investments':   (0.01, 0.01),
        'rent':          (0.12, 0.04),  # includes EMI obligations
    },
    'medium': {
        # NSSO: food share ~25%, shopping/entertainment rise to ~13%.
        # Split food: ~57% eating out, ~43% grocery. Entertainment split more evenly.
        'food':          (0.16, 0.05),
        'groceries':     (0.12, 0.04),
        'transport':     (0.14, 0.03),
        'utilities':     (0.10, 0.03),
        'health':        (0.05, 0.03),
        'entertainment': (0.05, 0.02),
        'shopping':      (0.04, 0.02),
        'trip':          (0.02, 0.01),
        'education':     (0.02, 0.01),
        'investments':   (0.08, 0.04),
        'rent':          (0.12, 0.03),
    },
    'high': {
        # NSSO upper-middle: food ~18%, investments ~12%, rent proportion falls.
        # High discretionary — shopping and trips grow noticeably.
        'food':          (0.13, 0.04),
        'groceries':     (0.09, 0.03),
        'transport':     (0.13, 0.03),
        'utilities':     (0.08, 0.02),
        'health':        (0.04, 0.02),
        'entertainment': (0.07, 0.03),
        'shopping':      (0.07, 0.03),
        'trip':          (0.04, 0.02),
        'education':     (0.03, 0.02),
        'investments':   (0.12, 0.05),
        'rent':          (0.10, 0.03),
    },
    'premium': {
        # Investment-heavy. Shopping + trips highly elevated.
        # Food share ~16% total (eating out dominant).
        'food':          (0.10, 0.03),
        'groceries':     (0.06, 0.02),
        'transport':     (0.10, 0.02),
        'utilities':     (0.06, 0.02),
        'health':        (0.03, 0.02),
        'entertainment': (0.08, 0.03),
        'shopping':      (0.08, 0.03),
        'trip':          (0.07, 0.03),
        'education':     (0.05, 0.02),
        'investments':   (0.20, 0.07),
        'rent':          (0.08, 0.02),
    },
}

# Spend volatility: normalised std-dev of monthly spend, by income bracket.
# Low income = high volatility (irregular income, unexpected expenses).
# Premium = low volatility (stable income, planned spending).
VOLATILITY_PARAMS = {
    'low':     (0.22, 0.06),
    'medium':  (0.14, 0.04),
    'high':    (0.09, 0.03),
    'premium': (0.06, 0.02),
}


def generate_synthetic_user(income_bracket: str) -> dict:
    """
    Generates one synthetic user's monthly spending profile.

    Returns a dict with 14 features:
        monthly_income_estimate,
        food_pct, groceries_pct, transport_pct,
        entertainment_pct, shopping_pct, trip_pct, education_pct,
        utilities_pct, health_pct, investments_pct, rent_pct,
        savings_rate, spend_volatility_normalised
    """
    low, high = INCOME_RANGES[income_bracket]
    income = np.random.uniform(low, high)

    props = BASE_PROPORTIONS[income_bracket]
    spending_pct = {}

    for category, (mean, std) in props.items():
        # Gaussian noise around NSSO mean; clipped to [0.005, 0.60]
        proportion = np.clip(np.random.normal(mean, std), 0.005, 0.60)
        spending_pct[category] = proportion

    total_spend_pct = sum(spending_pct.values())

    # If total spend exceeds income (can happen with noise), scale down
    # proportionally so savings_rate >= 0. Retain shape, just compress.
    if total_spend_pct >= 1.0:
        scale = 0.95 / total_spend_pct
        spending_pct = {k: v * scale for k, v in spending_pct.items()}
        total_spend_pct = sum(spending_pct.values())

    savings_rate = 1.0 - total_spend_pct

    # Spend volatility: normalised by income, independent of category mix
    vol_mean, vol_std = VOLATILITY_PARAMS[income_bracket]
    spend_volatility_normalised = np.clip(
        np.random.normal(vol_mean, vol_std), 0.01, 0.60
    )

    return {
        'monthly_income_estimate':     round(income, 2),
        'food_pct':                    round(spending_pct['food'], 4),
        'groceries_pct':               round(spending_pct['groceries'], 4),
        'transport_pct':               round(spending_pct['transport'], 4),
        'entertainment_pct':           round(spending_pct['entertainment'], 4),
        'shopping_pct':                round(spending_pct['shopping'], 4),
        'trip_pct':                    round(spending_pct['trip'], 4),
        'education_pct':               round(spending_pct['education'], 4),
        'utilities_pct':               round(spending_pct['utilities'], 4),
        'health_pct':                  round(spending_pct['health'], 4),
        'investments_pct':             round(spending_pct['investments'], 4),
        'rent_pct':                    round(spending_pct['rent'], 4),
        'savings_rate':                round(savings_rate, 4),
        'spend_volatility_normalised': round(spend_volatility_normalised, 4),
    }


def generate_dataset() -> pd.DataFrame:
    """Generates 5,000 synthetic users across all income brackets."""
    bracket_counts = [
        ('low',     1500),
        ('medium',  2000),
        ('high',    1000),
        ('premium',  500),
    ]

    rows = []
    for bracket, count in bracket_counts:
        for _ in range(count):
            rows.append(generate_synthetic_user(bracket))

    return pd.DataFrame(rows)


def print_summary(df: pd.DataFrame) -> None:
    print(f"\nDataset shape: {df.shape}")
    print(f"\nFeature summary:\n{df.describe().round(4).to_string()}")
    print(f"\nSavings rate distribution:")
    print(f"  Negative (overspenders): {(df['savings_rate'] < 0).sum()}")
    print(f"  0–10%:  {((df['savings_rate'] >= 0) & (df['savings_rate'] < 0.10)).sum()}")
    print(f"  10–25%: {((df['savings_rate'] >= 0.10) & (df['savings_rate'] < 0.25)).sum()}")
    print(f"  25–50%: {((df['savings_rate'] >= 0.25) & (df['savings_rate'] < 0.50)).sum()}")
    print(f"  >50%:   {(df['savings_rate'] >= 0.50).sum()}")


if __name__ == '__main__':
    output_dir = os.path.dirname(__file__)
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'training_data.csv')

    print("Generating synthetic training data...")
    df = generate_dataset()

    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} rows to {output_path}")

    print_summary(df)
