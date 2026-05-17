"""
Ranker model evaluation.

Checks:
  1. NDCG@1, NDCG@3, NDCG@5 on held-out user groups (target NDCG@5 > 0.70)
  2. Acceptance rate simulation: do top-ranked items have higher acceptance?
  3. Feature importance: does estimated_monthly_saving dominate? It should.

Usage:
    cd finsight-ml
    venv/Scripts/python evaluate/ranker_evaluation.py
"""

import os
import sys

import joblib
import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from models.ranker_model import RANKER_FEATURES, ndcg_at_k

ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')
DATA_PATH = os.path.join(ROOT, 'data', 'processed', 'ranker_training.csv')


def load():
    model = joblib.load(os.path.join(ARTIFACTS_DIR, 'ranker_model.pkl'))
    df = pd.read_csv(DATA_PATH)
    return model, df


def evaluate_ndcg(model, df):
    rng = np.random.default_rng(42)
    unique_users = df['user_idx'].unique()
    n_test = max(1, int(len(unique_users) * 0.15))
    test_users = set(rng.choice(unique_users, n_test, replace=False).tolist())

    test_df = df[df['user_idx'].isin(test_users)].sort_values('user_idx').reset_index(drop=True)
    X_test = test_df[RANKER_FEATURES].values
    scores = model.predict(X_test)
    test_df['score'] = scores

    y_groups, s_groups = [], []
    for user_id, group in test_df.groupby('user_idx'):
        y_groups.append(group['relevance'].tolist())
        s_groups.append(group['score'].tolist())

    print("\n" + "=" * 60)
    print("RANKER MODEL -- NDCG EVALUATION")
    print("=" * 60)
    print("  Test set: {} user-goal groups".format(len(y_groups)))
    print()
    for k in [1, 3, 5]:
        ndcg = ndcg_at_k(y_groups, s_groups, k)
        target = 0.70 if k == 5 else None
        verdict = ""
        if target:
            verdict = "  [PASS]" if ndcg > target else "  [NEEDS WORK]"
        print("  NDCG@{}: {:.4f}{}".format(k, ndcg, verdict))


def evaluate_acceptance_simulation(model, df):
    """
    For each user, rank categories by model score vs by saving amount.
    Check if model ranking correlates better with simulated acceptance
    (proxy: category_acceptance_rate x user_has_reduced_before).
    """
    print("\n" + "=" * 60)
    print("ACCEPTANCE SIMULATION")
    print("=" * 60)

    X = df[RANKER_FEATURES].values
    df = df.copy()
    df['score'] = model.predict(X)
    df['acceptance_proxy'] = (
        df['category_acceptance_rate'] * 0.6 +
        df['user_has_reduced_before'] * 0.3 +
        (df['estimated_monthly_saving'] / df['estimated_monthly_saving'].max()) * 0.1
    )

    # Spearman rank correlation between model score and acceptance proxy
    from scipy.stats import spearmanr
    corr, p = spearmanr(df['score'], df['acceptance_proxy'])
    print("\n  Model score vs acceptance_proxy Spearman correlation:")
    print("  rho = {:.4f}  p = {:.4f}  {}".format(
        corr, p, "[significant]" if p < 0.05 else "[not significant]"))

    saving_corr, _ = spearmanr(df['estimated_monthly_saving'], df['acceptance_proxy'])
    print("\n  Baseline (monthly_saving vs acceptance_proxy):")
    print("  rho = {:.4f}  (model {} baseline)".format(
        saving_corr, "beats" if corr > saving_corr else "underperforms"))


def evaluate_feature_importance(model):
    print("\n" + "=" * 60)
    print("FEATURE IMPORTANCES (gain)")
    print("=" * 60)
    importance = model.feature_importance(importance_type='gain')
    total = importance.sum()
    print()
    for feat, imp in sorted(zip(RANKER_FEATURES, importance), key=lambda x: -x[1]):
        bar = '|' * int(imp / total * 40)
        print("  {:<35} {:>8.1f}  {}".format(feat, imp, bar))


if __name__ == '__main__':
    if not os.path.exists(DATA_PATH):
        print("ERROR: Run models/ranker_model.py first.")
        sys.exit(1)

    try:
        from scipy.stats import spearmanr
    except ImportError:
        print("Install scipy: pip install scipy")
        sys.exit(1)

    model, df = load()
    evaluate_ndcg(model, df)
    evaluate_acceptance_simulation(model, df)
    evaluate_feature_importance(model)
