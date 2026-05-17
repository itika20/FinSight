"""
K-Means cluster model training for FinSight savings goal feature.

What this produces:
    artifacts/cluster_model.pkl       -- trained KMeans model
    artifacts/cluster_scaler.pkl      -- StandardScaler fitted on training data
    artifacts/cluster_benchmarks.json -- mean spend profile per cluster

Usage:
    cd finsight-ml
    python training/train_cluster.py

The scaler MUST be saved and used at inference time -- never refit on user data.
"""

import json
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, 'data', 'training_data.csv')
ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')

# ─────────────────────────────────────────────────────────────────────────────
# Feature columns -- must match exactly what the inference API receives
# ─────────────────────────────────────────────────────────────────────────────
FEATURES = [
    'monthly_income_estimate',
    'food_pct',
    'groceries_pct',
    'transport_pct',
    'shopping_pct',
    'entertainment_pct',
    'utilities_pct',
    'healthcare_pct',
    'investments_pct',
    'fuel_pct',
    'savings_rate',
    'spend_volatility_normalised',
]

CATEGORY_FEATURES = [
    'food_pct', 'groceries_pct', 'transport_pct', 'shopping_pct',
    'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct',
]

K_RANGE = range(3, 15)
MIN_USEFUL_K = 5   # fewer clusters is too coarse for spending archetypes
RANDOM_STATE = 42
N_INIT = 10
MAX_ITER = 300


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 -- Load and scale
# ─────────────────────────────────────────────────────────────────────────────
def load_and_scale(path):
    df = pd.read_csv(path)
    assert list(df.columns) == FEATURES, (
        "CSV columns don't match FEATURES.\n"
        "Expected: {}\nGot: {}".format(FEATURES, list(df.columns))
    )
    print("Loaded {} rows x {} features from {}".format(len(df), len(df.columns), path))

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(df[FEATURES])
    return df, X_scaled, scaler


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 -- Find optimal K via elbow + silhouette
# ─────────────────────────────────────────────────────────────────────────────
def find_optimal_k(X_scaled):
    print("\nRunning elbow + silhouette analysis for K={}..{}".format(
        K_RANGE.start, K_RANGE.stop - 1))
    print("{:>3}  {:>12}  {:>12}".format("K", "Inertia", "Silhouette"))
    print("-" * 32)

    inertias = []
    sil_scores = []

    for k in K_RANGE:
        model = KMeans(n_clusters=k, random_state=RANDOM_STATE,
                       n_init=N_INIT, max_iter=MAX_ITER)
        labels = model.fit_predict(X_scaled)
        inertias.append(model.inertia_)
        sil_scores.append(silhouette_score(X_scaled, labels))
        print("{:>3}  {:>12.1f}  {:>12.4f}".format(k, model.inertia_, sil_scores[-1]))

    # Elbow: largest second-order difference in inertia
    inertia_arr = np.array(inertias)
    d1 = np.diff(inertia_arr)
    d2 = np.diff(d1)
    elbow_idx = int(np.argmax(d2)) + 2   # two diffs shift index by 1 each
    elbow_k = list(K_RANGE)[elbow_idx]

    # Silhouette peak
    sil_arr = np.array(sil_scores)
    sil_k = list(K_RANGE)[int(np.argmax(sil_arr))]

    print("\nElbow method suggests  K = {}".format(elbow_k))
    print("Silhouette peak at     K = {}  (score={:.4f})".format(sil_k, sil_arr.max()))

    if elbow_k == sil_k:
        optimal_k = elbow_k
        print("Both methods agree -> K = {}".format(optimal_k))
    elif sil_k < MIN_USEFUL_K:
        # Silhouette collapses to very small K (income-bracket grouping in synthetic data).
        # Elbow gives better granularity for spending recommendations.
        optimal_k = elbow_k
        print("Silhouette K={} is too coarse (< {}) -> using elbow K = {}".format(
            sil_k, MIN_USEFUL_K, optimal_k))
    else:
        elbow_sil = sil_scores[list(K_RANGE).index(elbow_k)]
        sil_sil = sil_scores[list(K_RANGE).index(sil_k)]
        optimal_k = elbow_k if elbow_sil >= sil_sil else sil_k
        print("Methods disagree -> choosing K = {} (silhouette: {:.4f})".format(
            optimal_k, max(elbow_sil, sil_sil)))

    return optimal_k


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 -- Train final model
# ─────────────────────────────────────────────────────────────────────────────
def train_final(X_scaled, k):
    print("\nTraining final KMeans with K={} ...".format(k))
    model = KMeans(
        n_clusters=k,
        random_state=RANDOM_STATE,
        n_init=N_INIT,
        max_iter=MAX_ITER,
    )
    model.fit(X_scaled)
    labels = model.labels_

    sil   = silhouette_score(X_scaled, labels)
    db    = davies_bouldin_score(X_scaled, labels)   # lower = better separated
    ch    = calinski_harabasz_score(X_scaled, labels) # higher = denser clusters

    sizes = np.bincount(labels)
    balance = sizes.min() / sizes.max()  # 1.0 = perfectly balanced, <0.3 = skewed

    print("\n  Metric                  Value    Guide")
    print("  " + "-" * 52)
    print("  Inertia           {:>10.1f}    lower = tighter clusters".format(model.inertia_))
    print("  Silhouette        {:>10.4f}    >0.2 good, >0.5 strong".format(sil))
    print("  Davies-Bouldin    {:>10.4f}    <1.0 good, lower = better".format(db))
    print("  Calinski-Harabasz {:>10.1f}    higher = better".format(ch))
    print("  Size balance      {:>10.4f}    min/max ratio, >0.3 acceptable".format(balance))
    print("  Cluster sizes     {}".format(sorted(sizes.tolist(), reverse=True)))

    return model


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 -- Generate cluster benchmarks
# ─────────────────────────────────────────────────────────────────────────────
def generate_benchmarks(df, model):
    df = df.copy()
    df['cluster'] = model.labels_
    k = model.n_clusters

    benchmarks = {}
    print("\nCluster profiles (K={}):".format(k))
    print("{:>8}  {:>6}  {:>11}  {:>12}  {}".format(
        "Cluster", "Size", "AvgIncome", "SavingsRate", "Top-spend category"))
    print("-" * 70)

    for cluster_id in range(k):
        subset = df[df['cluster'] == cluster_id]
        profile = {
            'size': int(len(subset)),
            'avg_income': round(float(subset['monthly_income_estimate'].mean()), 2),
            'avg_savings_rate': round(float(subset['savings_rate'].mean()), 4),
            'avg_volatility': round(float(subset['spend_volatility_normalised'].mean()), 4),
        }
        for cat in CATEGORY_FEATURES:
            profile[cat] = round(float(subset[cat].mean()), 4)

        benchmarks[cluster_id] = profile

        top_cat = max(CATEGORY_FEATURES, key=lambda c: profile[c])
        print("{:>8}  {:>6}  Rs{:>9,.0f}  {:>11.1%}  {}".format(
            cluster_id,
            profile['size'],
            profile['avg_income'],
            profile['avg_savings_rate'],
            top_cat.replace('_pct', ''),
        ))

    return benchmarks


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 -- Save artifacts
# ─────────────────────────────────────────────────────────────────────────────
def save_artifacts(model, scaler, benchmarks):
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    model_path = os.path.join(ARTIFACTS_DIR, 'cluster_model.pkl')
    scaler_path = os.path.join(ARTIFACTS_DIR, 'cluster_scaler.pkl')
    bench_path = os.path.join(ARTIFACTS_DIR, 'cluster_benchmarks.json')

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    with open(bench_path, 'w') as f:
        json.dump(benchmarks, f, indent=2)

    print("\nArtifacts saved:")
    print("  {}".format(model_path))
    print("  {}".format(scaler_path))
    print("  {}".format(bench_path))


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if not os.path.exists(DATA_PATH):
        print("ERROR: training data not found at {}".format(DATA_PATH))
        print("Run:  python data/generate_synthetic.py")
        sys.exit(1)

    df, X_scaled, scaler = load_and_scale(DATA_PATH)
    optimal_k = find_optimal_k(X_scaled)
    model = train_final(X_scaled, optimal_k)
    benchmarks = generate_benchmarks(df, model)
    save_artifacts(model, scaler, benchmarks)

    print("\nDone. Artifacts ready in finsight-ml/artifacts/")
