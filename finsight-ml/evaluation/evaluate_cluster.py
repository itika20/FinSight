"""
Cluster quality evaluation for the K-Means spending model.

Since K-Means is unsupervised, there are no built-in accuracy labels.
This script uses the income bracket each synthetic user was generated from
as ground truth, then measures how well the learned clusters align with it.

Two evaluation layers:
  Layer 1 -- Cluster-intrinsic metrics (no ground truth needed)
             Silhouette, Davies-Bouldin, Calinski-Harabasz, purity, ARI, NMI
  Layer 2 -- Classification metrics (using income bracket as ground truth)
             Accuracy, Precision, Recall, F1 per bracket and macro-averaged

Usage:
    cd finsight-ml
    venv/Scripts/python evaluation/evaluate_cluster.py
"""

import json
import os
from collections import Counter

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    classification_report,
    confusion_matrix,
    davies_bouldin_score,
    homogeneity_completeness_v_measure,
    normalized_mutual_info_score,
    silhouette_score,
)

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, 'data', 'training_data.csv')
ARTIFACTS_DIR = os.path.join(ROOT, 'artifacts')

FEATURES = [
    'monthly_income_estimate', 'food_pct', 'groceries_pct', 'transport_pct',
    'shopping_pct', 'entertainment_pct', 'utilities_pct', 'healthcare_pct',
    'investments_pct', 'fuel_pct', 'savings_rate', 'spend_volatility_normalised',
]

# Income bracket boundaries (must match generate_synthetic.py)
BRACKET_BOUNDARIES = [
    ('low',     15_000,  30_000),
    ('medium',  30_000,  75_000),
    ('high',    75_000, 150_000),
    ('premium', 150_000, 400_000),
]

BRACKET_NAMES = ['low', 'medium', 'high', 'premium']


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def infer_bracket(income: float) -> str:
    """Re-derive income bracket from the income value."""
    for name, lo, hi in BRACKET_BOUNDARIES:
        if lo <= income < hi:
            return name
    # Edge case: income exactly at upper boundary of premium
    return 'premium'


def majority_vote_mapping(cluster_labels: np.ndarray, true_labels: np.ndarray) -> dict:
    """
    For each cluster, find the most common true bracket label.
    Returns {cluster_id: bracket_name}.
    This is how we convert an unsupervised cluster ID into a
    human-readable label we can score against ground truth.
    """
    mapping = {}
    for cluster_id in np.unique(cluster_labels):
        mask = cluster_labels == cluster_id
        bracket_counts = Counter(true_labels[mask])
        mapping[cluster_id] = bracket_counts.most_common(1)[0][0]
    return mapping


def cluster_purity(cluster_labels: np.ndarray, true_labels: np.ndarray) -> float:
    """
    Fraction of samples that are in the majority class of their cluster.
    1.0 = every cluster is 100% one bracket. 0.25 = random assignment.
    """
    total = len(cluster_labels)
    correct = 0
    for cluster_id in np.unique(cluster_labels):
        mask = cluster_labels == cluster_id
        counts = Counter(true_labels[mask])
        correct += counts.most_common(1)[0][1]
    return correct / total


def print_separator(char='-', width=70):
    print(char * width)


# ─────────────────────────────────────────────────────────────────────────────
# Main evaluation
# ─────────────────────────────────────────────────────────────────────────────
def evaluate():
    # ── Load data and artifacts ──────────────────────────────────────────────
    df = pd.read_csv(DATA_PATH)
    model = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_model.pkl'))
    scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_scaler.pkl'))
    with open(os.path.join(ARTIFACTS_DIR, 'cluster_benchmarks.json')) as f:
        benchmarks = {int(k): v for k, v in json.load(f).items()}

    X = df[FEATURES]
    X_scaled = scaler.transform(X)

    cluster_labels = model.predict(X_scaled)
    true_labels = np.array([infer_bracket(inc) for inc in df['monthly_income_estimate']])

    # ─────────────────────────────────────────────────────────────────────────
    # LAYER 1 -- Intrinsic cluster quality (no ground truth)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("LAYER 1 -- INTRINSIC CLUSTER QUALITY  (no ground truth required)")
    print("=" * 70)

    sil  = silhouette_score(X_scaled, cluster_labels)
    db   = davies_bouldin_score(X_scaled, cluster_labels)
    ch   = calinski_harabasz_score(X_scaled, cluster_labels)
    ari  = adjusted_rand_score(true_labels, cluster_labels)
    nmi  = normalized_mutual_info_score(true_labels, cluster_labels)
    hom, comp, vmeasure = homogeneity_completeness_v_measure(true_labels, cluster_labels)
    purity = cluster_purity(cluster_labels, true_labels)

    print("\n  {:<30} {:>10}  {}".format("Metric", "Value", "Interpretation"))
    print_separator()
    rows = [
        ("Silhouette score",        sil,      ">0.2 acceptable | >0.5 strong"),
        ("Davies-Bouldin index",    db,       "<1.0 good | lower = better separated"),
        ("Calinski-Harabasz index", ch,       "higher = denser, better-separated"),
        ("Cluster purity",          purity,   "fraction in majority class per cluster"),
        ("Adjusted Rand Index",     ari,      "0=random | 1=perfect vs income bracket"),
        ("Normalized Mutual Info",  nmi,      "0=no info shared | 1=perfect alignment"),
        ("Homogeneity",             hom,      "each cluster = one bracket only"),
        ("Completeness",            comp,     "each bracket = one cluster only"),
        ("V-measure",               vmeasure, "harmonic mean of H and C"),
    ]
    for label, value, note in rows:
        print("  {:<30} {:>10.4f}  {}".format(label, value, note))

    # ─────────────────────────────────────────────────────────────────────────
    # Cluster-to-bracket mapping table
    # ─────────────────────────────────────────────────────────────────────────
    mapping = majority_vote_mapping(cluster_labels, true_labels)

    print("\n  Cluster -> Bracket mapping (majority vote):")
    print("  {:<12} {:<12} {:<8}  {}".format(
        "Cluster ID", "Maps to", "Size", "Bracket composition"))
    print_separator()
    for cid in sorted(mapping.keys()):
        mask = cluster_labels == cid
        counts = Counter(true_labels[mask])
        total = mask.sum()
        composition = "  ".join(
            "{}: {:.0f}%".format(b, counts.get(b, 0) / total * 100)
            for b in BRACKET_NAMES if counts.get(b, 0) > 0
        )
        print("  {:<12} {:<12} {:<8}  {}".format(
            cid, mapping[cid], total, composition))

    # ─────────────────────────────────────────────────────────────────────────
    # LAYER 2 -- Classification metrics using bracket as ground truth
    # ─────────────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("LAYER 2 -- CLASSIFICATION METRICS  (income bracket = ground truth)")
    print("=" * 70)
    print("""
  Methodology: map each cluster to its majority income bracket, then treat
  this as a multi-class classifier and score against the known brackets.
  This measures how well K-Means re-discovers the income structure.
""")

    predicted_brackets = np.array([mapping[c] for c in cluster_labels])

    # Overall accuracy
    accuracy = (predicted_brackets == true_labels).mean()
    print("  Overall accuracy: {:.2%}  ({} of {} correct)\n".format(
        accuracy, (predicted_brackets == true_labels).sum(), len(true_labels)))

    # Per-class report
    report = classification_report(
        true_labels, predicted_brackets,
        labels=BRACKET_NAMES,
        target_names=BRACKET_NAMES,
        digits=4,
        zero_division=0,
    )
    print("  Per-bracket precision / recall / F1:\n")
    for line in report.strip().split('\n'):
        print("  " + line)

    # ─────────────────────────────────────────────────────────────────────────
    # Confusion matrix
    # ─────────────────────────────────────────────────────────────────────────
    print("\n  Confusion matrix  (rows = true bracket, cols = predicted bracket):")
    print("  {:<12}".format(""), end="")
    for b in BRACKET_NAMES:
        print("{:>10}".format(b), end="")
    print()
    print_separator(width=55)

    cm = confusion_matrix(true_labels, predicted_brackets, labels=BRACKET_NAMES)
    for i, row_label in enumerate(BRACKET_NAMES):
        print("  {:<10}".format(row_label), end="")
        for j, val in enumerate(cm[i]):
            marker = " <--" if i == j else ""
            print("{:>10}{}".format(val, marker), end="")
        print()

    # ─────────────────────────────────────────────────────────────────────────
    # Summary verdict
    # ─────────────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    if accuracy >= 0.75:
        verdict = "GOOD -- clusters align well with income brackets"
    elif accuracy >= 0.55:
        verdict = "ACCEPTABLE -- moderate alignment, clusters have mixed brackets"
    else:
        verdict = "WEAK -- clusters don't track income brackets well"

    print("\n  Accuracy:   {:.2%}  -- {}".format(accuracy, verdict))
    print("  ARI:        {:.4f}  -- {} vs random assignment".format(
        ari, "better" if ari > 0.3 else "close to random"))
    print("  Purity:     {:.4f}  -- {:.1f}% of users in their cluster's majority bracket".format(
        purity, purity * 100))
    print()
    print("  Note: K-Means clusters on spending PATTERN, not income directly.")
    print("  Perfect bracket recovery is not the goal -- the goal is that users")
    print("  who spend similarly are grouped together, regardless of bracket.")
    print("  Use Layer 1 metrics (silhouette, ARI) as the primary quality signal.")


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — Recommendation sanity check
# ─────────────────────────────────────────────────────────────────────────────
OVERSPEND_THRESHOLD = 0.02

CUT_PRIORITY = [
    'entertainment', 'shopping', 'food', 'transport',
    'fuel', 'groceries', 'utilities', 'healthcare', 'investments',
]

# DB category -> feature suffix mapping
CAT_MAP = {
    'food': 'food_pct', 'groceries': 'groceries_pct', 'transport': 'transport_pct',
    'shopping': 'shopping_pct', 'entertainment': 'entertainment_pct',
    'utilities': 'utilities_pct', 'healthcare': 'healthcare_pct',
    'investments': 'investments_pct', 'fuel': 'fuel_pct',
}

# Five handcrafted test profiles — each has one obviously dominant overspend
# and an expected top recommendation category.
SANITY_CASES = [
    {
        'name': 'Food overspender (45% on food)',
        'profile': {
            'monthly_income_estimate': 60000,
            'food_pct': 0.45,          # 45% -- peer avg ~16-20% in this income band
            'groceries_pct': 0.08,
            'transport_pct': 0.06,
            'shopping_pct': 0.05,
            'entertainment_pct': 0.02,
            'utilities_pct': 0.08,
            'healthcare_pct': 0.03,
            'investments_pct': 0.05,
            'fuel_pct': 0.04,
            'savings_rate': 0.14,
            'spend_volatility_normalised': 0.14,
        },
        'goal_amount': 150000,
        'goal_months': 12,
        'expected_top': 'food',
    },
    {
        'name': 'Entertainment heavy (18% on entertainment)',
        'profile': {
            'monthly_income_estimate': 80000,
            'food_pct': 0.20,
            'groceries_pct': 0.10,
            'transport_pct': 0.08,
            'shopping_pct': 0.08,
            'entertainment_pct': 0.18,  # 18% -- peer avg ~5-8%
            'utilities_pct': 0.08,
            'healthcare_pct': 0.03,
            'investments_pct': 0.05,
            'fuel_pct': 0.05,
            'savings_rate': 0.15,
            'spend_volatility_normalised': 0.09,
        },
        'goal_amount': 150000,
        'goal_months': 12,
        'expected_top': 'entertainment',
    },
    {
        'name': 'Shopping heavy (30% on shopping)',
        'profile': {
            'monthly_income_estimate': 50000,
            'food_pct': 0.20,
            'groceries_pct': 0.10,
            'transport_pct': 0.06,
            'shopping_pct': 0.30,       # 30% -- peer avg ~5-10%
            'entertainment_pct': 0.03,
            'utilities_pct': 0.08,
            'healthcare_pct': 0.03,
            'investments_pct': 0.03,
            'fuel_pct': 0.04,
            'savings_rate': 0.13,
            'spend_volatility_normalised': 0.14,
        },
        'goal_amount': 60000,
        'goal_months': 6,
        'expected_top': 'shopping',
    },
    {
        'name': 'Already on track (high saver, Rs1.2L income)',
        'profile': {
            'monthly_income_estimate': 120000,
            'food_pct': 0.12,
            'groceries_pct': 0.08,
            'transport_pct': 0.06,
            'shopping_pct': 0.10,
            'entertainment_pct': 0.06,
            'utilities_pct': 0.06,
            'healthcare_pct': 0.03,
            'investments_pct': 0.20,
            'fuel_pct': 0.05,
            'savings_rate': 0.24,       # saving Rs28,800/month; goal needs Rs12,500
            'spend_volatility_normalised': 0.06,
        },
        'goal_amount': 150000,
        'goal_months': 12,
        'expected_top': None,           # no cutbacks needed
    },
    {
        'name': 'Transport heavy commuter (20% on transport)',
        'profile': {
            'monthly_income_estimate': 45000,
            'food_pct': 0.22,
            'groceries_pct': 0.10,
            'transport_pct': 0.20,      # 20% -- peer avg ~7-10%
            'shopping_pct': 0.06,
            'entertainment_pct': 0.03,
            'utilities_pct': 0.10,
            'healthcare_pct': 0.04,
            'investments_pct': 0.04,
            'fuel_pct': 0.05,
            'savings_rate': 0.16,
            'spend_volatility_normalised': 0.14,
        },
        'goal_amount': 80000,
        'goal_months': 8,
        'expected_top': 'transport',
    },
]


def _compute_gaps(profile, benchmark):
    income = profile['monthly_income_estimate']
    gaps = []
    for cat, feat_key in CAT_MAP.items():
        user_pct = profile[feat_key]
        peer_pct = benchmark.get(feat_key, 0.0)
        gap_pct = user_pct - peer_pct
        if gap_pct > OVERSPEND_THRESHOLD:
            gaps.append((cat, gap_pct * income))
    gaps.sort(key=lambda x: -x[1])
    return gaps


def _recommend_top(profile, gaps, goal_amount, goal_months):
    income = profile['monthly_income_estimate']
    current_saving = profile['savings_rate'] * income
    required = goal_amount / goal_months
    if required <= current_saving:
        return None   # already on track
    if not gaps:
        return None
    # Walk priority list, return first category that has a gap
    gap_cats = {cat for cat, _ in gaps}
    for cat in CUT_PRIORITY:
        if cat in gap_cats:
            return cat
    return gaps[0][0]  # fallback


def sanity_check(model, scaler, benchmarks):
    print("\n" + "=" * 70)
    print("LAYER 3 -- RECOMMENDATION SANITY CHECK  (5 handcrafted test cases)")
    print("=" * 70)
    print()

    passed = 0
    for case in SANITY_CASES:
        profile = case['profile']
        expected = case['expected_top']

        feature_vector = pd.DataFrame(
            [[profile[f] for f in FEATURES]],
            columns=FEATURES,
        )
        X_scaled = scaler.transform(feature_vector)
        cluster_id = int(model.predict(X_scaled)[0])
        benchmark = benchmarks[cluster_id]

        gaps = _compute_gaps(profile, benchmark)
        top = _recommend_top(profile, gaps, case['goal_amount'], case['goal_months'])

        ok = top == expected
        if ok:
            passed += 1

        status = "PASS" if ok else "FAIL"
        print("  [{}]  {}".format(status, case['name']))
        print("        Cluster {}  |  top recommendation: {}  |  expected: {}".format(
            cluster_id,
            top if top else "none (on track)",
            expected if expected else "none (on track)",
        ))
        if gaps:
            top3 = "  ".join("{} Rs{:,.0f}/mo".format(c, a) for c, a in gaps[:3])
            print("        Gaps: {}".format(top3))
        print()

    print("  Result: {}/{} cases passed".format(passed, len(SANITY_CASES)))
    if passed >= 4:
        print("  Verdict: GOOD -- model produces intuitive recommendations")
    elif passed >= 3:
        print("  Verdict: ACCEPTABLE -- minor edge cases fail")
    else:
        print("  Verdict: REVIEW NEEDED -- benchmark profiles may need adjustment")


def load_artifacts():
    model = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_model.pkl'))
    scaler = joblib.load(os.path.join(ARTIFACTS_DIR, 'cluster_scaler.pkl'))
    with open(os.path.join(ARTIFACTS_DIR, 'cluster_benchmarks.json')) as f:
        return model, scaler, {int(k): v for k, v in json.load(f).items()}


if __name__ == '__main__':
    evaluate()
    model, scaler, benchmarks = load_artifacts()
    sanity_check(model, scaler, benchmarks)
