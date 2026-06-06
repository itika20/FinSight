"""
Full training pipeline — runs all three models end to end.

Step 1: Generate synthetic user profiles (5000 users, 12 features)
Step 2: Train K-Means clustering model (Model 1)
Step 3: Train Random Forest elasticity model (Model 2)
Step 4: Train LightGBM LambdaRank ranker (Model 3)

Artifacts produced in artifacts/:
  cluster_model.pkl, cluster_scaler.pkl, cluster_benchmarks.json
  elasticity_model.pkl, elasticity_scaler.pkl
  ranker_model.pkl

Usage:
    cd finsight-ml
    venv/Scripts/python train_all.py
"""

import os
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)


def step(label):
    print("\n" + "=" * 70)
    print("  {}".format(label))
    print("=" * 70)


def main():
    t_start = time.time()

    # ── Step 1: Synthetic data ──────────────────────────────────────────────
    step("STEP 1 / 4 -- Generating synthetic training data")
    from data.generate_synthetic import generate_dataset, print_summary
    import pandas as pd, os as _os
    data_path = os.path.join(ROOT, 'data', 'training_data.csv')
    df = generate_dataset()
    df.to_csv(data_path, index=False)
    print("Saved {} rows to {}".format(len(df), data_path))
    print_summary(df)

    # ── Step 2: Cluster model ───────────────────────────────────────────────
    step("STEP 2 / 4 -- Training K-Means cluster model (Model 1)")
    from models.cluster_model import (
        load_and_scale, find_optimal_k, train_final,
        generate_benchmarks, save_artifacts,
    )
    df, X_scaled, scaler = load_and_scale(data_path)
    optimal_k = find_optimal_k(X_scaled)
    cluster_model = train_final(X_scaled, optimal_k)
    benchmarks = generate_benchmarks(df, cluster_model)
    save_artifacts(cluster_model, scaler, benchmarks)

    # ── Step 3: Elasticity model ────────────────────────────────────────────
    step("STEP 3 / 4 -- Training Random Forest elasticity model (Model 2)")
    from models.elasticity_model import (
        generate_elasticity_data, train, evaluate, save,
    )
    import json
    with open(os.path.join(ROOT, 'artifacts', 'cluster_benchmarks.json')) as f:
        benchmarks_loaded = {int(k): v for k, v in json.load(f).items()}

    elasticity_data = generate_elasticity_data(df, cluster_model, scaler, benchmarks_loaded)
    e_model, e_scaler, X_test_s, y_test, test_cats = train(elasticity_data)
    evaluate(e_model, X_test_s, y_test, test_cats)
    save(e_model, e_scaler, elasticity_data)

    # ── Step 4: Ranker model ────────────────────────────────────────────────
    step("STEP 4 / 4 -- Training LightGBM LambdaRank ranker (Model 3)")
    import joblib
    from models.ranker_model import (
        generate_ranker_data, train as train_ranker,
        evaluate as evaluate_ranker, save as save_ranker,
    )
    e_model_loaded = joblib.load(os.path.join(ROOT, 'artifacts', 'elasticity_model.pkl'))
    e_scaler_loaded = joblib.load(os.path.join(ROOT, 'artifacts', 'elasticity_scaler.pkl'))
    elasticity_df = pd.read_csv(os.path.join(ROOT, 'data', 'processed', 'elasticity_training.csv'))

    ranker_df = generate_ranker_data(elasticity_df, e_model_loaded, e_scaler_loaded)
    r_model, X_test, y_test_r, test_groups = train_ranker(ranker_df)
    evaluate_ranker(r_model, X_test, y_test_r, test_groups)
    save_ranker(r_model, ranker_df)

    # ── Done ────────────────────────────────────────────────────────────────
    elapsed = time.time() - t_start
    print("\n" + "=" * 70)
    print("  ALL MODELS TRAINED  ({:.1f}s)".format(elapsed))
    print("=" * 70)
    print("\nArtifacts in finsight-ml/artifacts/:")
    for fname in sorted(os.listdir(os.path.join(ROOT, 'artifacts'))):
        path = os.path.join(ROOT, 'artifacts', fname)
        size_kb = os.path.getsize(path) / 1024
        print("  {:40s} {:>8.1f} KB".format(fname, size_kb))


if __name__ == '__main__':
    main()
