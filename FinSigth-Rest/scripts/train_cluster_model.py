"""
Cluster model trainer for FinSight savings goal model.

Trains a KMeans clustering model on the synthetic training data produced by
generate_training_data.py, then recomputes cluster_benchmarks.json from the
resulting cluster assignments.

Artefacts written:
    artifacts/cluster_model.pkl    — fitted sklearn KMeans (6 clusters)
    artifacts/cluster_scaler.pkl   — fitted StandardScaler for the same features
    artifacts/cluster_benchmarks.json — per-cluster mean spending benchmarks

Usage:
    cd FinSigth-Rest
    python scripts/generate_training_data.py   # regenerate training data first
    python scripts/train_cluster_model.py

Requirements:
    scikit-learn, numpy, pandas  (all present in requirements.txt)
"""

import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# ─────────────────────────────────────────────────────────────────────────────
# Must match CLUSTER_FEATURE_ORDER in app/services/goal_service.py exactly.
# Changing this list requires updating that constant and restarting the API.
# ─────────────────────────────────────────────────────────────────────────────
FEATURE_ORDER = [
    'monthly_income_estimate',
    'food_pct', 'groceries_pct', 'transport_pct', 'shopping_pct',
    'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct',
    'savings_rate', 'spend_volatility_normalised',
]

# Benchmark keys to carry into cluster_benchmarks.json.
# These are used by compute_gaps() to compare user spend against peers.
BENCHMARK_PCT_KEYS = [
    'food_pct', 'groceries_pct', 'transport_pct', 'shopping_pct',
    'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct',
]

N_CLUSTERS = 6
SEED = 42


def load_training_data(data_path: str) -> pd.DataFrame:
    df = pd.read_csv(data_path)
    missing = [c for c in FEATURE_ORDER if c not in df.columns]
    if missing:
        raise ValueError(f"Training data missing columns: {missing}")
    return df[FEATURE_ORDER]


def train(df: pd.DataFrame):
    """Fit scaler + KMeans; return (scaler, model, cluster_labels)."""
    X = df.values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = KMeans(n_clusters=N_CLUSTERS, random_state=SEED, n_init=20)
    labels = model.fit_predict(X_scaled)

    inertia = model.inertia_
    print(f"KMeans converged after {model.n_iter_} iterations  |  inertia: {inertia:.1f}")

    return scaler, model, labels


def build_benchmarks(df: pd.DataFrame, labels: np.ndarray) -> dict:
    """
    Compute per-cluster mean statistics used by compute_gaps() at runtime.

    Each cluster entry contains:
      size                — number of training samples assigned to the cluster
      avg_income          — mean monthly_income_estimate
      avg_savings_rate    — mean savings_rate
      avg_volatility      — mean spend_volatility_normalised
      <category>_pct      — mean spending percentage for each modelled category
    """
    df = df.copy()
    df['_cluster'] = labels

    benchmarks = {}
    for cluster_id in sorted(df['_cluster'].unique()):
        subset = df[df['_cluster'] == cluster_id]
        entry = {
            'size':             int(len(subset)),
            'avg_income':       round(float(subset['monthly_income_estimate'].mean()), 2),
            'avg_savings_rate': round(float(subset['savings_rate'].mean()), 4),
            'avg_volatility':   round(float(subset['spend_volatility_normalised'].mean()), 4),
        }
        for key in BENCHMARK_PCT_KEYS:
            entry[key] = round(float(subset[key].mean()), 4)
        benchmarks[str(cluster_id)] = entry

    return benchmarks


def print_cluster_summary(benchmarks: dict) -> None:
    sep = "-" * 70
    print(f"\n{sep}")
    print(f"{'Cluster':>8}  {'Size':>5}  {'Income':>8}  {'Savings':>8}  "
          f"{'Food':>6}  {'Groceries':>9}  {'Shopping':>8}")
    print(sep)
    for cid, b in benchmarks.items():
        print(
            f"  {cid:>6}  {b['size']:>5}  "
            f"Rs{b['avg_income']:>7,.0f}  "
            f"{b['avg_savings_rate']:>7.1%}  "
            f"{b['food_pct']:>5.1%}  "
            f"{b['groceries_pct']:>8.1%}  "
            f"{b['shopping_pct']:>7.1%}"
        )
    print(sep)


def save_artifacts(scaler, model, benchmarks: dict, artifacts_dir: str) -> None:
    os.makedirs(artifacts_dir, exist_ok=True)

    scaler_path    = os.path.join(artifacts_dir, 'cluster_scaler.pkl')
    model_path     = os.path.join(artifacts_dir, 'cluster_model.pkl')
    benchmarks_path = os.path.join(artifacts_dir, 'cluster_benchmarks.json')

    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"Saved scaler    : {scaler_path}")

    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    print(f"Saved model     : {model_path}")

    with open(benchmarks_path, 'w') as f:
        json.dump(benchmarks, f, indent=2)
    print(f"Saved benchmarks: {benchmarks_path}")


if __name__ == '__main__':
    base_dir      = os.path.join(os.path.dirname(__file__), '..')
    data_path     = os.path.join(base_dir, 'data', 'training_data.csv')
    artifacts_dir = os.path.join(base_dir, 'artifacts')

    print(f"Loading training data from {data_path} …")
    df = load_training_data(data_path)
    print(f"Loaded {len(df)} rows × {len(df.columns)} features")

    print(f"\nTraining KMeans (k={N_CLUSTERS}, seed={SEED}) …")
    scaler, model, labels = train(df)

    print("\nBuilding cluster benchmarks …")
    benchmarks = build_benchmarks(df, labels)

    print_cluster_summary(benchmarks)

    print("\nSaving artefacts …")
    save_artifacts(scaler, model, benchmarks, artifacts_dir)

    print("\nDone. Restart the API server to load the new model artefacts.")
