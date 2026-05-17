"""
Model artifact loader for the FinSight goal service.

Loads the three K-Means artifacts once at API startup and attaches them
to app.state so every request can access them without re-loading from disk.

Artifacts (from finsight-ml/artifacts/, copied to FinSigth-Rest/artifacts/):
  cluster_model.pkl       — trained KMeans (sklearn)
  cluster_scaler.pkl      — StandardScaler fitted on training data
  cluster_benchmarks.json — mean spend profile per cluster (JSON)
"""

import json
import logging
import os

import joblib
from fastapi import FastAPI

from app.core.constants import LOGGER_GOALS

logger = logging.getLogger(LOGGER_GOALS)

# Artifacts sit next to the app/ package, one level up from core/
_ARTIFACTS_DIR = os.path.join(
    os.path.dirname(__file__),   # app/core/
    '..', '..', 'artifacts'      # -> FinSigth-Rest/artifacts/
)


def load_models(app: FastAPI) -> None:
    """
    Load all three model artifacts into app.state.
    Called once from the FastAPI startup event in main.py.

    After this call:
        app.state.cluster_model      — KMeans instance
        app.state.cluster_scaler     — StandardScaler instance
        app.state.cluster_benchmarks — dict[int, dict]
    """
    artifacts_dir = os.path.abspath(_ARTIFACTS_DIR)
    logger.info("Loading model artifacts from %s", artifacts_dir)

    model_path = os.path.join(artifacts_dir, 'cluster_model.pkl')
    scaler_path = os.path.join(artifacts_dir, 'cluster_scaler.pkl')
    bench_path = os.path.join(artifacts_dir, 'cluster_benchmarks.json')

    elasticity_model_path  = os.path.join(artifacts_dir, 'elasticity_model.pkl')
    elasticity_scaler_path = os.path.join(artifacts_dir, 'elasticity_scaler.pkl')
    ranker_model_path      = os.path.join(artifacts_dir, 'ranker_model.pkl')

    for path in (model_path, scaler_path, bench_path,
                 elasticity_model_path, elasticity_scaler_path, ranker_model_path):
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Model artifact not found: {path}\n"
                "Run finsight-ml/train_all.py and copy artifacts/ to FinSigth-Rest/artifacts/"
            )

    app.state.cluster_model      = joblib.load(model_path)
    app.state.cluster_scaler     = joblib.load(scaler_path)
    app.state.elasticity_model   = joblib.load(elasticity_model_path)
    app.state.elasticity_scaler  = joblib.load(elasticity_scaler_path)
    app.state.ranker_model       = joblib.load(ranker_model_path)

    with open(bench_path) as f:
        raw = json.load(f)
    app.state.cluster_benchmarks = {int(k): v for k, v in raw.items()}

    n_clusters = app.state.cluster_model.n_clusters
    logger.info(
        "Models loaded: K=%d clusters | elasticity RF | LightGBM ranker",
        n_clusters,
    )
