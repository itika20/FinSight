"""
Elasticity model evaluation.

Checks:
  1. Overall MAE and R2 on held-out test set
  2. Per-category MAE (healthcare/groceries should be lower than entertainment)
  3. Monotonicity check: higher spend_vs_benchmark should predict higher reduction
  4. Direction check: discretionary categories should get higher reductions than essential

Usage:
    cd finsight-ml
    venv/Scripts/python evaluate/elasticity_evaluation.py
"""

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from models.elasticity_model import CATEGORIES, CATEGORY_TYPE, ELASTICITY_FEATURES

ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')
DATA_PATH = os.path.join(ROOT, 'data', 'processed', 'elasticity_training.csv')


def load():
    model = joblib.load(os.path.join(ARTIFACTS_DIR, 'elasticity_model.pkl'))
    scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'elasticity_scaler.pkl'))
    df = pd.read_csv(DATA_PATH)
    return model, scaler, df


def evaluate_basic(model, scaler, df):
    from sklearn.model_selection import train_test_split
    X = df[ELASTICITY_FEATURES]
    y = df['realistic_reduction_pct']
    _, X_test, _, y_test, _, cats = train_test_split(
        X, y, df['category'], test_size=0.15, random_state=42
    )
    X_test_s = scaler.transform(X_test)
    preds = model.predict(X_test_s)

    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    print("\n" + "=" * 60)
    print("ELASTICITY MODEL -- BASIC METRICS")
    print("=" * 60)
    print("  MAE:    {:.4f}  ({:.1f}%)  [target < 5%]  {}".format(
        mae, mae * 100, "PASS" if mae < 0.05 else "FAIL"))
    print("  R2:     {:.4f}            [target > 0.80] {}".format(
        r2, "PASS" if r2 > 0.80 else "NEEDS WORK"))

    print("\nPer-category MAE (sorted by category type):")
    print("  {:<16} {:>8}  {:>8}  {}".format("Category", "MAE", "Type", "Verdict"))
    print("  " + "-" * 50)
    test_df = pd.DataFrame({'y': y_test.values, 'p': preds, 'cat': cats.values})
    for cat in sorted(CATEGORIES, key=lambda c: -CATEGORY_TYPE[c]):
        sub = test_df[test_df['cat'] == cat]
        cat_mae = mean_absolute_error(sub['y'], sub['p'])
        cat_type = CATEGORY_TYPE[cat]
        # Essential categories should have lower absolute MAE (smaller range)
        ok = (cat_mae < 0.06) if cat_type < 0.3 else (cat_mae < 0.08)
        print("  {:<16} {:>8.4f}  {:>8.2f}  {}".format(
            cat, cat_mae, cat_type, "OK" if ok else "HIGH"))


def evaluate_monotonicity(model, scaler, df):
    """
    Users further above benchmark should get higher predicted reductions.
    Test: split into quartiles by spend_vs_cluster_benchmark, check mean prediction rises.
    """
    print("\n" + "=" * 60)
    print("MONOTONICITY CHECK (higher overspend -> higher predicted cut)")
    print("=" * 60)

    X_s = scaler.transform(df[ELASTICITY_FEATURES])
    df = df.copy()
    df['pred'] = model.predict(X_s)
    df['benchmark_quartile'] = pd.qcut(
        df['spend_vs_cluster_benchmark'], q=4,
        labels=['Q1 (lowest)', 'Q2', 'Q3', 'Q4 (highest)']
    )

    print("\n  {:<16} {:>12}  {:>12}".format("Quartile", "Mean pred", "Mean actual"))
    print("  " + "-" * 44)
    grouped = df.groupby('benchmark_quartile')[['pred', 'realistic_reduction_pct']].mean()
    prev_pred = -1
    monotone = True
    for q, row in grouped.iterrows():
        ok = row['pred'] > prev_pred
        if not ok:
            monotone = False
        prev_pred = row['pred']
        print("  {:<16} {:>12.4f}  {:>12.4f}  {}".format(
            str(q), row['pred'], row['realistic_reduction_pct'],
            "" if ok else "<-- non-monotone"))

    print("\n  Monotonicity: {}".format("PASS" if monotone else "FAIL -- recheck features or data"))


def evaluate_direction(model, scaler, df):
    """
    Discretionary categories should have higher mean predicted reduction than essential ones.
    """
    print("\n" + "=" * 60)
    print("DIRECTION CHECK (discretionary > essential in predicted reduction)")
    print("=" * 60)

    X_s = scaler.transform(df[ELASTICITY_FEATURES])
    df = df.copy()
    df['pred'] = model.predict(X_s)

    disc = df[df['category_type'] >= 0.70]['pred'].mean()
    semi = df[(df['category_type'] >= 0.30) & (df['category_type'] < 0.70)]['pred'].mean()
    ess = df[df['category_type'] < 0.30]['pred'].mean()

    print("\n  Discretionary (type >= 0.70): mean reduction = {:.4f}".format(disc))
    print("  Semi-discretionary (0.30-0.70): mean reduction = {:.4f}".format(semi))
    print("  Essential (type < 0.30):       mean reduction = {:.4f}".format(ess))
    print("\n  Direction: {}".format(
        "PASS" if disc > semi > ess else "FAIL -- category_type not driving predictions"))


if __name__ == '__main__':
    if not os.path.exists(DATA_PATH):
        print("ERROR: Run models/elasticity_model.py first.")
        sys.exit(1)
    model, scaler, df = load()
    evaluate_basic(model, scaler, df)
    evaluate_monotonicity(model, scaler, df)
    evaluate_direction(model, scaler, df)
