"""
Model 2 -- Spending Elasticity Estimator (Random Forest Regressor)

Predicts realistic_reduction_pct: the fraction of a user's spend in a given
category that can realistically be reduced. This is the core of the "how much
to cut" recommendation — not just that the user overspends, but by how much
they can realistically reduce without extreme lifestyle change.

Training data: generated from synthetic user profiles + cluster assignments.
One row per (user, category) pair: 5000 users x 9 categories = 45,000 rows.

Target variable: realistic_reduction_pct (0.0 to 0.50)
  - Discretionary (entertainment, shopping):   20-40% reduction realistic
  - Semi-discretionary (food, transport, fuel): 10-25%
  - Essential (groceries, utilities, healthcare, investments): 1-10%
  Modifiers: spend_vs_benchmark, volatility, Gaussian noise.

Evaluation metric: MAE on reduction percentage (target < 5%).

Artifacts produced:
  artifacts/elasticity_model.pkl
  artifacts/elasticity_scaler.pkl

Usage:
    cd finsight-ml
    python models/elasticity_model.py
"""

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, 'data', 'training_data.csv')
ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')

RANDOM_STATE = 42
np.random.seed(RANDOM_STATE)

# ─────────────────────────────────────────────────────────────────────────────
# Domain constants
# ─────────────────────────────────────────────────────────────────────────────

# How discretionary each category is (0 = essential, 1 = fully optional)
# Drives the base reduction range in target simulation
CATEGORY_TYPE = {
    'food':          0.50,   # semi -- eating out is optional, groceries aren't
    'groceries':     0.15,   # mostly essential
    'transport':     0.40,   # semi -- some is commuting (essential), some isn't
    'shopping':      0.90,   # highly discretionary
    'entertainment': 1.00,   # fully discretionary
    'utilities':     0.10,   # essential
    'healthcare':    0.05,   # essential -- never recommend cutting
    'investments':   0.30,   # semi -- can defer but harms long-term wealth
    'fuel':          0.45,   # semi -- some commuting, some leisure driving
}

# Simulated average acceptance rate per category (used as ranker feature later)
CATEGORY_ACCEPTANCE_RATE = {
    'food':          0.45,
    'groceries':     0.30,
    'transport':     0.35,
    'shopping':      0.60,
    'entertainment': 0.65,
    'utilities':     0.25,
    'healthcare':    0.15,
    'investments':   0.20,
    'fuel':          0.40,
}

CATEGORIES = list(CATEGORY_TYPE.keys())

CLUSTER_FEATURES = [
    'monthly_income_estimate', 'food_pct', 'groceries_pct', 'transport_pct',
    'shopping_pct', 'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct', 'savings_rate', 'spend_volatility_normalised',
]

INCOME_BRACKET_BOUNDS = [
    ('low', 30_000), ('medium', 75_000), ('high', 150_000), ('premium', float('inf')),
]
BRACKET_ENCODING = {'low': 0, 'medium': 1, 'high': 2, 'premium': 3}

ELASTICITY_FEATURES = [
    'current_avg_monthly_spend',
    'spend_vs_cluster_benchmark',
    'spend_volatility_normalised',
    'income_bracket_encoded',
    'category_type',
    'months_consistently_present',
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def infer_bracket(income):
    for name, upper in INCOME_BRACKET_BOUNDS:
        if income < upper:
            return name
    return 'premium'


def simulate_months_active(category_type, rng):
    """
    Essential categories are spent every month; discretionary ones are sporadic.
    """
    if category_type >= 0.7:       # discretionary
        return int(rng.integers(4, 10))
    elif category_type >= 0.3:     # semi
        return int(rng.integers(7, 12))
    else:                          # essential
        return int(rng.integers(10, 13))


def simulate_reduction_target(category, spend_vs_benchmark, volatility, rng):
    """
    Rule-based target with controlled noise.
    RF will learn these non-linear relationships from 45,000 examples.
    """
    cat_type = CATEGORY_TYPE[category]

    if cat_type >= 0.80:
        lo, hi = 0.20, 0.40
    elif cat_type >= 0.35:
        lo, hi = 0.10, 0.25
    else:
        lo, hi = 0.01, 0.08

    base = rng.uniform(lo, hi)

    # Further above benchmark = more room to cut
    if spend_vs_benchmark > 2.5:
        base += 0.12
    elif spend_vs_benchmark > 2.0:
        base += 0.08
    elif spend_vs_benchmark > 1.5:
        base += 0.04
    elif spend_vs_benchmark < 1.1:
        base = max(base - 0.05, lo * 0.5)

    # High volatility = spend is already variable = user can flex more
    if volatility > 0.18:
        base += 0.03
    elif volatility < 0.07:
        base -= 0.02

    base += float(rng.normal(0, 0.025))
    return float(np.clip(base, 0.0, 0.50))


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 -- Generate elasticity training data
# ─────────────────────────────────────────────────────────────────────────────
def generate_elasticity_data(df, cluster_model, cluster_scaler, benchmarks):
    """
    Creates 45,000 (user x category) training rows from the synthetic
    user profiles + cluster assignments.
    """
    rng = np.random.default_rng(RANDOM_STATE)

    X_scaled = cluster_scaler.transform(df[CLUSTER_FEATURES])
    cluster_labels = cluster_model.predict(X_scaled)

    rows = []
    for idx, (_, user) in enumerate(df.iterrows()):
        cluster_id = int(cluster_labels[idx])
        benchmark = benchmarks[cluster_id]
        income = float(user['monthly_income_estimate'])
        bracket = infer_bracket(income)
        volatility = float(user['spend_volatility_normalised'])

        for cat in CATEGORIES:
            feat_key = f'{cat}_pct'
            user_pct = float(user[feat_key])
            peer_pct = float(benchmark.get(feat_key, 0.001))

            spend_vs_benchmark = user_pct / max(peer_pct, 0.001)
            current_spend = user_pct * income
            months_active = simulate_months_active(CATEGORY_TYPE[cat], rng)
            target = simulate_reduction_target(cat, spend_vs_benchmark, volatility, rng)

            rows.append({
                'category':                    cat,
                'current_avg_monthly_spend':   round(current_spend, 2),
                'spend_vs_cluster_benchmark':  round(spend_vs_benchmark, 4),
                'spend_volatility_normalised': round(volatility, 4),
                'income_bracket_encoded':      BRACKET_ENCODING[bracket],
                'category_type':               CATEGORY_TYPE[cat],
                'months_consistently_present': months_active,
                'realistic_reduction_pct':     round(target, 4),
            })

    return pd.DataFrame(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 -- Train
# ─────────────────────────────────────────────────────────────────────────────
def train(data):
    X = data[ELASTICITY_FEATURES]
    y = data['realistic_reduction_pct']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=RANDOM_STATE
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    print("Training Random Forest ({} rows, {} features)...".format(len(X_train), len(ELASTICITY_FEATURES)))
    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=10,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_train_s, y_train)
    return model, scaler, X_test_s, y_test, data.loc[X_test.index, 'category']


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 -- Evaluate
# ─────────────────────────────────────────────────────────────────────────────
def evaluate(model, X_test_s, y_test, categories):
    preds = model.predict(X_test_s)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    print("\nOverall metrics:")
    print("  MAE: {:.4f}  ({:.1f}%)   target < 0.05 (5%)".format(mae, mae * 100))
    print("  R2:  {:.4f}             target > 0.80".format(r2))
    print("  MAE < 5%: {}".format("PASS" if mae < 0.05 else "FAIL"))

    print("\nPer-category MAE:")
    test_df = pd.DataFrame({'y_true': y_test.values, 'y_pred': preds, 'category': categories.values})
    print("  {:<16} {:>8}  {}".format("Category", "MAE", "Type"))
    print("  " + "-" * 40)
    for cat in CATEGORIES:
        sub = test_df[test_df['category'] == cat]
        cat_mae = mean_absolute_error(sub['y_true'], sub['y_pred'])
        print("  {:<16} {:>7.4f}  {:.2f}".format(cat, cat_mae, CATEGORY_TYPE[cat]))

    print("\nFeature importances:")
    importances = model.feature_importances_
    for feat, imp in sorted(zip(ELASTICITY_FEATURES, importances), key=lambda x: -x[1]):
        print("  {:<35} {:.4f}".format(feat, imp))


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 -- Save
# ─────────────────────────────────────────────────────────────────────────────
def save(model, scaler, elasticity_data):
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    joblib.dump(model, os.path.join(ARTIFACTS_DIR, 'elasticity_model.pkl'))
    joblib.dump(scaler, os.path.join(ARTIFACTS_DIR, 'elasticity_scaler.pkl'))
    out_path = os.path.join(ROOT, 'data', 'processed', 'elasticity_training.csv')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    elasticity_data.to_csv(out_path, index=False)
    print("\nArtifacts saved:")
    print("  " + os.path.join(ARTIFACTS_DIR, 'elasticity_model.pkl'))
    print("  " + os.path.join(ARTIFACTS_DIR, 'elasticity_scaler.pkl'))
    print("  " + out_path)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(DATA_PATH):
        print("ERROR: {} not found. Run data/generate_synthetic.py first.".format(DATA_PATH))
        sys.exit(1)

    cluster_model = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_model.pkl'))
    cluster_scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_scaler.pkl'))
    with open(os.path.join(ARTIFACTS_DIR, 'cluster_benchmarks.json')) as f:
        import json
        benchmarks = {int(k): v for k, v in json.load(f).items()}

    df = pd.read_csv(DATA_PATH)
    print("Loaded {} user profiles.".format(len(df)))

    print("Generating elasticity training data ({} rows)...".format(len(df) * len(CATEGORIES)))
    elasticity_data = generate_elasticity_data(df, cluster_model, cluster_scaler, benchmarks)

    model, scaler, X_test_s, y_test, test_categories = train(elasticity_data)
    evaluate(model, X_test_s, y_test, test_categories)
    save(model, scaler, elasticity_data)
    print("\nDone.")
    return model, scaler, elasticity_data


if __name__ == '__main__':
    main()
