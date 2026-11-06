"""Train the FraudLens model and export everything the app needs.

Outputs (written to ../api/model/):
  model.json    compact tree ensemble served by the dependency-free engine
  metrics.json  ROC/PR curves, threshold table, confusion matrix, importance,
                rule-based baseline and model card numbers
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
from sklearn.metrics import (average_precision_score, precision_recall_curve,
                             roc_auc_score, roc_curve)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ml.data import CATEGORIES, CHANNELS, FEATURES, generate  # noqa: E402

OUT = ROOT / "api" / "model"
OUT.mkdir(parents=True, exist_ok=True)
WEB = ROOT / "public" / "model"   # copy for the browser fallback engine
WEB.mkdir(parents=True, exist_ok=True)

# Business costs used for threshold tuning
FP_COST = 15.0      # analyst review + customer friction per wrongly blocked payment
CHARGEBACK_FEE = 25.0


def money(y, p, amt, t):
    pred = p >= t
    tp = pred & (y == 1); fp = pred & (y == 0); fn = ~pred & (y == 1)
    saved = amt[tp].sum() + CHARGEBACK_FEE * tp.sum()
    lost = amt[fn].sum() + CHARGEBACK_FEE * fn.sum()
    friction = FP_COST * fp.sum()
    return dict(tp=int(tp.sum()), fp=int(fp.sum()), fn=int(fn.sum()),
                tn=int((~pred & (y == 0)).sum()), saved=float(saved),
                lost=float(lost), friction=float(friction),
                net=float(saved - friction))


def main():
    df = generate()
    X = df[FEATURES]; y = df["is_fraud"].to_numpy(); amt = df["amount"].to_numpy()
    idx = np.arange(len(df))
    tr, te = train_test_split(idx, test_size=.2, stratify=y, random_state=1)
    tr, va = train_test_split(tr, test_size=.25, stratify=y[tr], random_state=2)

    params = dict(objective="binary", learning_rate=.05, num_leaves=15,
                  min_data_in_leaf=40, feature_fraction=.9, bagging_fraction=.8,
                  bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=3)
    dtr = lgb.Dataset(X.iloc[tr], y[tr])
    dva = lgb.Dataset(X.iloc[va], y[va])
    booster = lgb.train(params, dtr, 600, valid_sets=[dva],
                        callbacks=[lgb.early_stopping(40, verbose=False)])
    print("trees:", booster.num_trees())

    pv = booster.predict(X.iloc[va]); pt = booster.predict(X.iloc[te])

    # threshold that maximises net money saved on validation
    grid = np.round(np.arange(.01, 1.0, .01), 2)
    nets = [money(y[va], pv, amt[va], t)["net"] for t in grid]
    best_t = float(grid[int(np.argmax(nets))])
    print("best threshold:", best_t)

    yt, at = y[te], amt[te]
    table = []
    for t in grid:
        m = money(yt, pt, at, t)
        prec = m["tp"] / max(m["tp"] + m["fp"], 1)
        rec = m["tp"] / max(m["tp"] + m["fn"], 1)
        table.append(dict(t=float(t), precision=round(prec, 4), recall=round(rec, 4),
                          fpr=round(m["fp"] / max(m["fp"] + m["tn"], 1), 6), **m))
    at_best = next(r for r in table if abs(r["t"] - best_t) < 1e-9)

    fpr, tpr, _ = roc_curve(yt, pt)
    pr_p, pr_r, _ = precision_recall_curve(yt, pt)
    sel = lambda a, n=120: np.linspace(0, len(a) - 1, min(n, len(a))).astype(int)
    roc_pts = [[round(float(fpr[i]), 5), round(float(tpr[i]), 5)] for i in sel(fpr)]
    # interpolated PR curve on an even recall grid (max precision at recall >= r)
    pr_pts = []
    for r in np.linspace(0, 1, 101):
        mask = pr_r >= r
        pr_pts.append([round(float(r), 3), round(float(pr_p[mask].max()) if mask.any() else 0.0, 5)])

    # baseline: a typical hand-written rule set
    rule = ((X.iloc[te]["amount"] > 1000) | (X.iloc[te]["country_mismatch"] == 1)).to_numpy()
    r_tp = int((rule & (yt == 1)).sum()); r_fp = int((rule & (yt == 0)).sum())
    baseline = dict(name="Rules: amount > $1,000 OR foreign country",
                    recall=round(r_tp / yt.sum(), 4),
                    precision=round(r_tp / max(r_tp + r_fp, 1), 4),
                    fp=r_fp, tp=r_tp)

    gain = booster.feature_importance("gain")
    importance = sorted(
        [dict(feature=f, gain=round(float(g / gain.sum()), 4)) for f, g in zip(FEATURES, gain)],
        key=lambda d: -d["gain"])

    pattern_recall = {}
    te_df = df.iloc[te]
    pos = {i: k for k, i in enumerate(te)}
    for name, grp in te_df[te_df.is_fraud == 1].groupby("pattern"):
        ps = np.array([pt[pos[i]] for i in grp.index])
        pattern_recall[name] = round(float((ps >= best_t).mean()), 3)

    metrics = dict(
        threshold=best_t, fp_cost=FP_COST, chargeback_fee=CHARGEBACK_FEE,
        roc_auc=round(float(roc_auc_score(yt, pt)), 4),
        pr_auc=round(float(average_precision_score(yt, pt)), 4),
        test_rows=int(len(te)), test_frauds=int(yt.sum()),
        train_rows=int(len(tr)), fraud_rate=round(float(y.mean()), 4),
        n_trees=booster.num_trees(), at_threshold=at_best, table=table,
        roc=roc_pts, pr=pr_pts, baseline=baseline, importance=importance,
        pattern_recall=pattern_recall,
        params={k: v for k, v in params.items() if k not in ("verbose",)},
    )
    (OUT / "metrics.json").write_text(json.dumps(metrics, separators=(",", ":")))
    export_model(booster)
    print(json.dumps({k: metrics[k] for k in ("roc_auc", "pr_auc", "threshold", "baseline", "pattern_recall")}, indent=1))
    print("at threshold:", {k: at_best[k] for k in ("precision", "recall", "tp", "fp", "fn", "saved", "net")})
    booster.save_model(str(ROOT / "ml" / "lightgbm_model.txt"))
    for f in ("model.json", "metrics.json"):
        (WEB / f).write_bytes((OUT / f).read_bytes())


def export_model(booster: lgb.Booster):
    """Flatten LightGBM trees into arrays the pure-Python engine can walk."""
    dump = booster.dump_model()
    trees = []
    for t in dump["tree_info"]:
        nodes = []  # each: [feature, threshold, left, right, value] ; leaf: [-1, 0, 0, 0, value]

        def walk(n):
            i = len(nodes); nodes.append(None)
            if "leaf_value" in n:
                nodes[i] = [-1, 0, 0, 0, round(n["leaf_value"], 7)]
                return i
            assert n["decision_type"] == "<=", n["decision_type"]
            left = walk(n["left_child"]); right = walk(n["right_child"])
            nodes[i] = [n["split_feature"], round(n["threshold"], 7), left, right,
                        round(n["internal_value"], 7)]
            return i

        walk(t["tree_structure"])
        trees.append(nodes)
    model = dict(name="FraudLens LightGBM", features=FEATURES, categories=CATEGORIES,
                 channels=CHANNELS, trees=trees)
    (OUT / "model.json").write_text(json.dumps(model, separators=(",", ":")))
    print("model.json KB:", round((OUT / "model.json").stat().st_size / 1024))


if __name__ == "__main__":
    main()
