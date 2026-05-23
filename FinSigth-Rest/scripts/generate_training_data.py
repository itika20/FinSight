"""
Synthetic training data generator for FinSight savings goal model.

Generates 5,000 synthetic Indian household spending profiles parameterised
from NSSO Household Consumer Expenditure Survey distributions.

Key behavioural realism:
  food and groceries are drawn from a bivariate normal with r = -0.40.
  A person who eats out heavily tends to cook less (fewer grocery purchases),
  and vice versa. Independent Gaussian draws would produce impossible
  high-food + high-groceries combinations that distort cluster boundaries.

Output: data/training_data.csv (5000 rows × 12 feature columns)

Usage:
    cd FinSigth-Rest
    python scripts/generate_training_data.py
"""

import numpy as np
import pandas as pd
import os

SEED = 42
np.random.seed(SEED)

# Food–groceries Pearson correlation embedded in bivariate normal.
# r = -0.40: if food_pct is 1-std above its mean, groceries_pct is 0.40 stds
# below its mean. Conservative; real-world estimates range -0.35 to -0.55.
FOOD_GROCERIES_CORR = -0.40

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
        # Food-heavy, low discretionary spend. NSSO: food+beverages ~45%
        # split into food (eating out) and groceries (home cooking).
        'food':          (0.35, 0.08),
        'groceries':     (0.12, 0.03),
        'transport':     (0.08, 0.02),
        'utilities':     (0.15, 0.03),
        'healthcare':    (0.07, 0.04),
        'shopping':      (0.05, 0.02),
        'entertainment': (0.02, 0.01),
        'investments':   (0.01, 0.01),
        'fuel':          (0.04, 0.02),
    },
    'medium': {
        # Rising discretionary spend. Investments become meaningful.
        # NSSO: food share drops to ~25%, shopping/entertainment rise.
        'food':          (0.20, 0.06),
        'groceries':     (0.12, 0.03),
        'transport':     (0.10, 0.03),
        'utilities':     (0.10, 0.03),
        'healthcare':    (0.05, 0.03),
        'shopping':      (0.10, 0.04),
        'entertainment': (0.05, 0.02),
        'investments':   (0.08, 0.04),
        'fuel':          (0.06, 0.02),
    },
    'high': {
        # High discretionary spend. Shopping and investments dominate growth.
        # NSSO upper-middle bracket: food ~18%, investments ~12%.
        'food':          (0.15, 0.05),
        'groceries':     (0.10, 0.03),
        'transport':     (0.08, 0.02),
        'utilities':     (0.08, 0.02),
        'healthcare':    (0.04, 0.02),
        'shopping':      (0.15, 0.05),
        'entertainment': (0.08, 0.03),
        'investments':   (0.12, 0.05),
        'fuel':          (0.07, 0.02),
    },
    'premium': {
        # Investment-heavy. Shopping and entertainment elevated.
        # Food share falls to ~10%. Savings capacity significantly higher.
        'food':          (0.10, 0.04),
        'groceries':     (0.08, 0.02),
        'transport':     (0.06, 0.02),
        'utilities':     (0.06, 0.02),
        'healthcare':    (0.03, 0.02),
        'shopping':      (0.18, 0.06),
        'entertainment': (0.12, 0.04),
        'investments':   (0.20, 0.07),
        'fuel':          (0.05, 0.02),
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


def _food_groceries_cov(food_std: float, groceries_std: float) -> list[list[float]]:
    """
    2×2 covariance matrix for [food_pct, groceries_pct] with FOOD_GROCERIES_CORR.
    """
    cov_fg = FOOD_GROCERIES_CORR * food_std * groceries_std
    return [
        [food_std ** 2, cov_fg],
        [cov_fg,        groceries_std ** 2],
    ]


def generate_synthetic_user(income_bracket: str) -> dict:
    """
    Generates one synthetic user's monthly spending profile.

    food_pct and groceries_pct are drawn from a bivariate normal
    (correlation = FOOD_GROCERIES_CORR) to model the eat-out / cook-at-home
    trade-off. All other categories are drawn independently.

    Returns a dict with 12 features:
        monthly_income_estimate, food_pct, groceries_pct, transport_pct,
        shopping_pct, entertainment_pct, utilities_pct, healthcare_pct,
        investments_pct, fuel_pct, savings_rate, spend_volatility_normalised
    """
    low, high = INCOME_RANGES[income_bracket]
    income = np.random.uniform(low, high)

    props = BASE_PROPORTIONS[income_bracket]
    spending_pct = {}

    # ── Food & groceries: bivariate normal with negative correlation ──────────
    food_mean,      food_std      = props['food']
    groceries_mean, groceries_std = props['groceries']

    fg = np.random.multivariate_normal(
        mean=[food_mean, groceries_mean],
        cov=_food_groceries_cov(food_std, groceries_std),
    )
    spending_pct['food']      = float(np.clip(fg[0], 0.005, 0.60))
    spending_pct['groceries'] = float(np.clip(fg[1], 0.005, 0.60))

    # ── All other categories: independent Gaussian draws ─────────────────────
    for category in props:
        if category in ('food', 'groceries'):
            continue
        mean, std = props[category]
        proportion = np.clip(np.random.normal(mean, std), 0.005, 0.60)
        spending_pct[category] = float(proportion)

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
    spend_volatility_normalised = float(np.clip(
        np.random.normal(vol_mean, vol_std), 0.01, 0.60
    ))

    return {
        'monthly_income_estimate':     round(income, 2),
        'food_pct':                    round(spending_pct['food'], 4),
        'groceries_pct':               round(spending_pct['groceries'], 4),
        'transport_pct':               round(spending_pct['transport'], 4),
        'shopping_pct':                round(spending_pct['shopping'], 4),
        'entertainment_pct':           round(spending_pct['entertainment'], 4),
        'utilities_pct':               round(spending_pct['utilities'], 4),
        'healthcare_pct':              round(spending_pct['healthcare'], 4),
        'investments_pct':             round(spending_pct['investments'], 4),
        'fuel_pct':                    round(spending_pct['fuel'], 4),
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
    print(f"\nFood-groceries correlation (expect ~{FOOD_GROCERIES_CORR}):")
    print(f"  Actual: {df['food_pct'].corr(df['groceries_pct']):.3f}")
    print(f"\nSavings rate distribution:")
    print(f"  Negative (overspenders): {(df['savings_rate'] < 0).sum()}")
    print(f"  0–10%:  {((df['savings_rate'] >= 0) & (df['savings_rate'] < 0.10)).sum()}")
    print(f"  10–25%: {((df['savings_rate'] >= 0.10) & (df['savings_rate'] < 0.25)).sum()}")
    print(f"  25–50%: {((df['savings_rate'] >= 0.25) & (df['savings_rate'] < 0.50)).sum()}")
    print(f"  >50%:   {(df['savings_rate'] >= 0.50).sum()}")


if __name__ == '__main__':
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'training_data.csv')

    print("Generating synthetic training data...")
    df = generate_dataset()

    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} rows to {output_path}")

    print_summary(df)
