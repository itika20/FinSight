"""
Model 3 -- Recommendation Ranker (LightGBM LambdaRank)

Ranks recommendation candidates by predicted user acceptance * financial impact.
A rule-based system ranks categories purely by overspend amount (biggest gap first).
The ranker learns that a Rs4,000 entertainment cut is more likely to be accepted
than a Rs5,000 grocery cut — because acceptance depends on category psychology,
not just financial magnitude.

Training data: one row per (user, category) recommendation candidate.
Groups: each user-goal scenario is one LTR group.
Relevance labels: 0-4 integer scale (4 = strongly preferred recommendation).

Evaluation: NDCG@1, NDCG@3, NDCG@5 (target NDCG@5 > 0.70).

Artifacts produced:
  artifacts/ranker_model.pkl

Usage:
    cd finsight-ml
    python models/ranker_model.py
    (elasticity_model.py must have run first — reads elasticity_training.csv)
"""

import json
import os
import sys

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELASTICITY_DATA_PATH = os.path.join(ROOT, 'data', 'processed', 'elasticity_training.csv')
ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')

RANDOM_STATE = 42
np.random.seed(RANDOM_STATE)
rng = np.random.default_rng(RANDOM_STATE)

# ─────────────────────────────────────────────────────────────────────────────
# Domain constants (must match elasticity_model.py)
# ─────────────────────────────────────────────────────────────────────────────
CATEGORY_TYPE = {
    'food': 0.50, 'groceries': 0.15, 'transport': 0.40, 'shopping': 0.90,
    'entertainment': 1.00, 'utilities': 0.10, 'healthcare': 0.05,
    'investments': 0.30, 'fuel': 0.45,
}

CATEGORY_ACCEPTANCE_RATE = {
    'food': 0.45, 'groceries': 0.30, 'transport': 0.35, 'shopping': 0.60,
    'entertainment': 0.65, 'utilities': 0.25, 'healthcare': 0.15,
    'investments': 0.20, 'fuel': 0.40,
}

CATEGORIES = list(CATEGORY_TYPE.keys())

RANKER_FEATURES = [
    'estimated_monthly_saving',
    'spend_vs_benchmark_ratio',
    'category_acceptance_rate',
    'user_has_reduced_before',
    'goal_months_remaining',
    'gap_to_goal',
    'category_priority_rank',
    'category_type',
]

# Goal scenarios per user: sample from these realistic goal types
GOAL_SCENARIOS = [
    {'label': 'emergency_fund',  'amount_multiplier': 3,   'months': 6},
    {'label': 'vacation',        'amount_multiplier': 1.5, 'months': 12},
    {'label': 'down_payment',    'amount_multiplier': 12,  'months': 24},
    {'label': 'gadget',          'amount_multiplier': 0.5, 'months': 3},
    {'label': 'wedding',         'amount_multiplier': 6,   'months': 18},
]


# ─────────────────────────────────────────────────────────────────────────────
# Relevance simulation
# ─────────────────────────────────────────────────────────────────────────────
def simulate_relevance(monthly_saving, category, spend_vs_benchmark,
                       user_has_reduced, gap_to_goal):
    """
    0-4 integer relevance label. Higher = better recommendation.
    Combines financial impact with psychological acceptability.
    """
    score = 0

    # Financial impact (0-2 points)
    if monthly_saving > 5000:
        score += 2
    elif monthly_saving > 1500:
        score += 1

    # Category acceptability (0-1 point)
    if CATEGORY_TYPE[category] >= 0.70:
        score += 1

    # User history (0-1 point) — past flexibility predicts future
    if user_has_reduced:
        score += 1

    return min(int(score), 4)


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 -- Generate ranker training data
# ─────────────────────────────────────────────────────────────────────────────
def generate_ranker_data(elasticity_df, elasticity_model, elasticity_scaler):
    """
    For each of 5000 users, assign a random goal scenario, then create one
    ranking group with the recommendation candidates (categories) as items.

    Returns DataFrame with RANKER_FEATURES + relevance label + user_id group key.
    """
    from models.elasticity_model import ELASTICITY_FEATURES

    rows = []
    user_ids = elasticity_df.index.get_level_values(0).unique() if hasattr(
        elasticity_df.index, 'get_level_values') else range(len(elasticity_df) // len(CATEGORIES))

    # Rebuild per-user data: group elasticity_df by position (5000 users x 9 cats)
    n_users = len(elasticity_df) // len(CATEGORIES)

    for user_idx in range(n_users):
        start = user_idx * len(CATEGORIES)
        user_cats = elasticity_df.iloc[start:start + len(CATEGORIES)].reset_index(drop=True)
        if len(user_cats) == 0:
            continue

        income = user_cats['current_avg_monthly_spend'].sum() / (
            user_cats['category_type'].mean() + 0.01)  # rough income proxy

        # Assign goal scenario
        scenario = GOAL_SCENARIOS[user_idx % len(GOAL_SCENARIOS)]
        goal_amount = income * scenario['amount_multiplier']
        goal_months = scenario['months']
        monthly_saving_needed = goal_amount / goal_months

        # Estimate current saving (via spend_volatility_normalised proxy)
        current_saving = income * 0.12  # conservative estimate for planning

        gap_to_goal = max(monthly_saving_needed - current_saving, 0.0)

        # Predict elasticity for each category
        X_feat = user_cats[ELASTICITY_FEATURES]
        X_scaled = elasticity_scaler.transform(X_feat)
        reduction_pcts = elasticity_model.predict(X_scaled)

        # Sort categories by user's current spend (highest first = priority rank 1)
        spend_sorted = user_cats['current_avg_monthly_spend'].rank(ascending=False).astype(int)

        group_rows = []
        for i, cat_row in user_cats.iterrows():
            cat = cat_row['category']
            reduction_pct = float(np.clip(reduction_pcts[i], 0.0, 0.50))
            current_spend = float(cat_row['current_avg_monthly_spend'])
            monthly_saving = current_spend * reduction_pct
            spend_vs_benchmark = float(cat_row['spend_vs_cluster_benchmark'])

            # Simulate user_has_reduced_before (discretionary categories more likely)
            p_reduced = 0.3 + CATEGORY_TYPE[cat] * 0.4
            user_has_reduced = int(rng.random() < p_reduced)

            relevance = simulate_relevance(
                monthly_saving, cat, spend_vs_benchmark,
                user_has_reduced, gap_to_goal,
            )

            group_rows.append({
                'user_idx':                  user_idx,
                'category':                  cat,
                'estimated_monthly_saving':  round(monthly_saving, 2),
                'spend_vs_benchmark_ratio':  round(spend_vs_benchmark, 4),
                'category_acceptance_rate':  CATEGORY_ACCEPTANCE_RATE[cat],
                'user_has_reduced_before':   user_has_reduced,
                'goal_months_remaining':     goal_months,
                'gap_to_goal':               round(gap_to_goal, 2),
                'category_priority_rank':    int(spend_sorted[i]),
                'category_type':             CATEGORY_TYPE[cat],
                'relevance':                 relevance,
            })

        rows.extend(group_rows)

    return pd.DataFrame(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 -- Train LightGBM LambdaRank
# ─────────────────────────────────────────────────────────────────────────────
def train(ranker_df):
    # Sort by user group (required for LightGBM LTR)
    ranker_df = ranker_df.sort_values('user_idx').reset_index(drop=True)

    X = ranker_df[RANKER_FEATURES].values
    y = ranker_df['relevance'].values.astype(int)
    groups = ranker_df['user_idx'].values

    # Split users (not rows) into train/test
    unique_users = np.unique(groups)
    n_test_users = max(1, int(len(unique_users) * 0.15))
    rng_split = np.random.default_rng(RANDOM_STATE)
    test_users = set(rng_split.choice(unique_users, size=n_test_users, replace=False).tolist())

    train_mask = np.array([g not in test_users for g in groups])
    test_mask = ~train_mask

    X_train, y_train = X[train_mask], y[train_mask]
    X_test, y_test = X[test_mask], y[test_mask]

    # Group sizes (consecutive rows per user)
    train_group_sizes = ranker_df[train_mask].groupby('user_idx').size().values
    test_group_sizes = ranker_df[test_mask].groupby('user_idx').size().values

    print("Training LightGBM LambdaRank...")
    print("  Train: {} users, {} rows".format(len(train_group_sizes), len(X_train)))
    print("  Test:  {} users, {} rows".format(len(test_group_sizes), len(X_test)))

    lgb_train = lgb.Dataset(X_train, label=y_train, group=train_group_sizes, free_raw_data=False)
    lgb_valid = lgb.Dataset(X_test, label=y_test, group=test_group_sizes, free_raw_data=False)

    params = {
        'objective':        'lambdarank',
        'metric':           'ndcg',
        'eval_at':          [1, 3, 5],
        'learning_rate':    0.05,
        'num_leaves':       31,
        'min_data_in_leaf': 2,
        'verbosity':        -1,
        'seed':             RANDOM_STATE,
    }

    callbacks = [
        lgb.log_evaluation(period=50),
        lgb.early_stopping(stopping_rounds=20, verbose=False),
    ]

    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=300,
        valid_sets=[lgb_valid],
        callbacks=callbacks,
    )

    return model, X_test, y_test, test_group_sizes


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 -- Evaluate
# ─────────────────────────────────────────────────────────────────────────────
def ndcg_at_k(y_true_groups, y_pred_groups, k):
    """Compute mean NDCG@k across groups."""
    scores = []
    for y_true, y_pred in zip(y_true_groups, y_pred_groups):
        order = np.argsort(y_pred)[::-1]
        y_sorted = np.array(y_true)[order[:k]]
        ideal_sorted = np.sort(y_true)[::-1][:k]

        def dcg(rel):
            return sum(r / np.log2(i + 2) for i, r in enumerate(rel))

        idcg = dcg(ideal_sorted)
        scores.append(dcg(y_sorted) / idcg if idcg > 0 else 1.0)
    return float(np.mean(scores))


def evaluate(model, X_test, y_test, test_group_sizes):
    scores = model.predict(X_test)

    # Split into per-group arrays
    y_groups, s_groups = [], []
    start = 0
    for size in test_group_sizes:
        y_groups.append(y_test[start:start + size].tolist())
        s_groups.append(scores[start:start + size].tolist())
        start += size

    print("\nRanker evaluation:")
    for k in [1, 3, 5]:
        ndcg = ndcg_at_k(y_groups, s_groups, k)
        target_met = "PASS" if (k < 5 or ndcg > 0.70) else "NEEDS WORK"
        print("  NDCG@{}: {:.4f}  {}".format(k, ndcg, target_met if k == 5 else ""))

    print("\nFeature importances:")
    importance = model.feature_importance(importance_type='gain')
    for feat, imp in sorted(zip(RANKER_FEATURES, importance), key=lambda x: -x[1]):
        print("  {:<35} {:.1f}".format(feat, imp))


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 -- Save
# ─────────────────────────────────────────────────────────────────────────────
def save(model, ranker_df):
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    joblib.dump(model, os.path.join(ARTIFACTS_DIR, 'ranker_model.pkl'))
    out_path = os.path.join(ROOT, 'data', 'processed', 'ranker_training.csv')
    ranker_df.to_csv(out_path, index=False)
    print("\nArtifacts saved:")
    print("  " + os.path.join(ARTIFACTS_DIR, 'ranker_model.pkl'))
    print("  " + out_path)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(ELASTICITY_DATA_PATH):
        print("ERROR: {} not found. Run models/elasticity_model.py first.".format(ELASTICITY_DATA_PATH))
        sys.exit(1)

    elasticity_model = joblib.load(os.path.join(ARTIFACTS_DIR, 'elasticity_model.pkl'))
    elasticity_scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'elasticity_scaler.pkl'))

    elasticity_df = pd.read_csv(ELASTICITY_DATA_PATH)
    print("Loaded elasticity data: {} rows.".format(len(elasticity_df)))

    print("Generating ranker training data...")
    ranker_df = generate_ranker_data(elasticity_df, elasticity_model, elasticity_scaler)
    print("Generated {} ranker rows across {} user-goal groups.".format(
        len(ranker_df), ranker_df['user_idx'].nunique()))

    model, X_test, y_test, test_groups = train(ranker_df)
    evaluate(model, X_test, y_test, test_groups)
    save(model, ranker_df)
    print("\nDone.")
    return model


if __name__ == '__main__':
    main()
