"""Phase 8: full model evaluation — discrimination, ranking, business views."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
)


def ks_statistic(y_true, y_prob) -> float:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    order = np.argsort(y_prob)
    y = y_true[order]
    n_pos, n_neg = y.sum(), len(y) - y.sum()
    if n_pos == 0 or n_neg == 0:
        return 0.0
    return float(np.max(np.abs(np.cumsum(y) / n_pos - np.cumsum(1 - y) / n_neg)))


def gini(auc: float) -> float:
    return 2 * auc - 1


def discrimination_report(y_true, y_prob, threshold: float = 0.5) -> dict:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    y_pred = (y_prob >= threshold).astype(int)
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    auc = float(roc_auc_score(y_true, y_prob))
    fpr, tpr, thr = roc_curve(y_true, y_prob)
    idx = np.linspace(0, len(fpr) - 1, num=min(150, len(fpr))).astype(int)
    cm = confusion_matrix(y_true, y_pred).tolist()
    return {
        "roc_auc": auc,
        "gini": gini(auc),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "ks": ks_statistic(y_true, y_prob),
        "brier": float(brier_score_loss(y_true, y_prob)),
        "default_rate": float(np.mean(y_true)),
        "precision_default": float(report["1"]["precision"]),
        "recall_default": float(report["1"]["recall"]),
        "f1_default": float(report["1"]["f1-score"]),
        "accuracy": float(report["accuracy"]),
        "confusion_matrix": cm,
        "roc_curve": {"fpr": fpr[idx].round(4).tolist(), "tpr": tpr[idx].round(4).tolist()},
    }


def decile_table(y_true, y_prob, n_bins: int = 10) -> pd.DataFrame:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    df = pd.DataFrame({"y": y_true, "p": y_prob})
    try:
        df["decile"] = pd.qcut(df["p"], q=n_bins, labels=False, duplicates="drop")
    except ValueError:
        df["decile"] = pd.cut(df["p"], bins=n_bins, labels=False, include_lowest=True)
    g = (
        df.groupby("decile", dropna=False)
        .agg(n=("y", "size"), defaults=("y", "sum"), avg_pd=("p", "mean"), actual_dr=("y", "mean"))
        .reset_index()
        .sort_values("decile", ascending=False)
    )
    g["cum_defaults"] = g["defaults"].cumsum()
    g["cum_capture"] = g["cum_defaults"] / max(g["defaults"].sum(), 1)
    g["lift"] = g["actual_dr"] / max(float(df["y"].mean()), 1e-9)
    return g


def lift_gain_curve(y_true, y_prob, n_bins: int = 10) -> list[dict]:
    table = decile_table(y_true, y_prob, n_bins=n_bins)
    rows = [{"pct_population": 0.0, "cum_capture": 0.0, "lift": 1.0}]
    n = table["n"].sum()
    cum_n = 0
    for _, r in table.iterrows():
        cum_n += r["n"]
        rows.append(
            {
                "pct_population": float(cum_n / max(n, 1)),
                "cum_capture": float(r["cum_capture"]),
                "lift": float(r["lift"]),
            }
        )
    return rows


def threshold_scan(y_true, y_prob, thresholds=None) -> list[dict]:
    thresholds = thresholds if thresholds is not None else np.linspace(0.05, 0.5, 19)
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    rows = []
    for t in thresholds:
        pred = (y_prob >= t).astype(int)
        tp = int(((pred == 1) & (y_true == 1)).sum())
        fp = int(((pred == 1) & (y_true == 0)).sum())
        tn = int(((pred == 0) & (y_true == 0)).sum())
        fn = int(((pred == 0) & (y_true == 1)).sum())
        approval = float((pred == 0).mean())
        rows.append(
            {
                "threshold": float(t),
                "approval_rate": approval,
                "precision_bad": tp / max(tp + fp, 1),
                "recall_bad": tp / max(tp + fn, 1),
                "false_positive_rate": fp / max(fp + tn, 1),
            }
        )
    return rows
