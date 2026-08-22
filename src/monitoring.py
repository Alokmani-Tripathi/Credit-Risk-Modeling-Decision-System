"""Phase 14: PSI, CSI, data / prediction / performance drift monitoring."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.evaluation import discrimination_report, ks_statistic


def population_stability_index(
    expected: pd.Series | np.ndarray,
    actual: pd.Series | np.ndarray,
    n_bins: int = 10,
    eps: float = 1e-6,
) -> float:
    """PSI between reference (expected) and monitored (actual) distributions."""
    exp = pd.Series(pd.to_numeric(expected, errors="coerce")).dropna()
    act = pd.Series(pd.to_numeric(actual, errors="coerce")).dropna()
    if exp.nunique() <= 1 and act.nunique() <= 1:
        return 0.0
    if exp.nunique() <= 8 and set(act.dropna().unique()).issubset(set(exp.unique())):
        cats = sorted(set(exp.unique()) | set(act.unique()))
        e = exp.value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy(dtype=float)
        a = act.value_counts(normalize=True).reindex(cats, fill_value=0).to_numpy(dtype=float)
    else:
        qs = np.unique(np.quantile(exp, np.linspace(0, 1, n_bins + 1)))
        if len(qs) < 3:
            return 0.0
        e_ids = np.clip(np.digitize(exp, qs[1:-1], right=True), 0, len(qs) - 2)
        a_ids = np.clip(np.digitize(act, qs[1:-1], right=True), 0, len(qs) - 2)
        e = np.bincount(e_ids, minlength=len(qs) - 1).astype(float)
        a = np.bincount(a_ids, minlength=len(qs) - 1).astype(float)
        e = e / max(e.sum(), 1)
        a = a / max(a.sum(), 1)
    e = np.clip(e, eps, None)
    a = np.clip(a, eps, None)
    e = e / e.sum()
    a = a / a.sum()
    return float(np.sum((a - e) * np.log(a / e)))


def characteristic_stability_index(ref_df: pd.DataFrame, cur_df: pd.DataFrame, cols: list[str]) -> list[dict]:
    rows = []
    for c in cols:
        if c not in ref_df.columns or c not in cur_df.columns:
            continue
        psi = population_stability_index(ref_df[c], cur_df[c])
        rows.append(
            {
                "feature": c,
                "psi": psi,
                "status": "stable" if psi < 0.1 else "shift" if psi < 0.25 else "significant",
            }
        )
    return sorted(rows, key=lambda r: r["psi"], reverse=True)


def prediction_drift(ref_scores: np.ndarray, cur_scores: np.ndarray) -> dict:
    psi = population_stability_index(ref_scores, cur_scores)
    return {
        "psi_scores": psi,
        "ref_mean_pd": float(np.mean(ref_scores)),
        "cur_mean_pd": float(np.mean(cur_scores)),
        "mean_shift": float(np.mean(cur_scores) - np.mean(ref_scores)),
        "status": "stable" if psi < 0.1 else "shift" if psi < 0.25 else "significant",
    }


def performance_drift(y_ref, p_ref, y_cur, p_cur, cfg: dict | None = None) -> dict:
    cfg = cfg or {}
    mon = cfg.get("monitoring") or {}
    ref = discrimination_report(y_ref, p_ref)
    cur = discrimination_report(y_cur, p_cur)
    auc_drop = ref["roc_auc"] - cur["roc_auc"]
    ks_drop = ref["ks"] - cur["ks"]
    alerts = []
    if auc_drop >= float(mon.get("auc_drop_alert", 0.03)):
        alerts.append(f"AUC drop {auc_drop:.3f}")
    if ks_drop >= float(mon.get("ks_drop_alert", 0.03)):
        alerts.append(f"KS drop {ks_drop:.3f}")
    dr_shift = abs(cur["default_rate"] - ref["default_rate"])
    if dr_shift >= float(mon.get("default_rate_abs_alert", 0.03)):
        alerts.append(f"Default-rate shift {dr_shift:.3f}")
    return {
        "reference": {"auc": ref["roc_auc"], "ks": ref["ks"], "default_rate": ref["default_rate"]},
        "current": {"auc": cur["roc_auc"], "ks": cur["ks"], "default_rate": cur["default_rate"]},
        "auc_drop": auc_drop,
        "ks_drop": ks_drop,
        "alerts": alerts,
        "status": "alert" if alerts else "ok",
    }


def vintage_monitoring(
    df: pd.DataFrame,
    y: np.ndarray,
    scores: np.ndarray,
    feature_cols: list[str],
    time_col: str = "issue_d",
    ref_mask: np.ndarray | None = None,
) -> dict:
    """Build monthly monitoring series from scored vintages (proxy for production)."""
    frame = df.copy()
    frame["_y"] = y
    frame["_p"] = scores
    frame[time_col] = pd.to_datetime(frame[time_col], errors="coerce")
    frame = frame.dropna(subset=[time_col])
    frame["vintage"] = frame[time_col].dt.to_period("M").astype(str)

    if ref_mask is None:
        # earliest 40% of rows as reference
        ordered = frame.sort_values(time_col)
        cut = int(len(ordered) * 0.4)
        ref = ordered.iloc[:cut]
    else:
        ref = frame.loc[ref_mask]

    ref_scores = ref["_p"].to_numpy()
    series = []
    for vintage, g in frame.groupby("vintage"):
        if len(g) < 200:
            continue
        feat_psi = characteristic_stability_index(ref[feature_cols], g[feature_cols], feature_cols)
        max_psi = max((r["psi"] for r in feat_psi), default=0.0)
        pred = prediction_drift(ref_scores, g["_p"].to_numpy())
        metrics = discrimination_report(g["_y"].to_numpy(), g["_p"].to_numpy())
        series.append(
            {
                "vintage": vintage,
                "n": int(len(g)),
                "default_rate": metrics["default_rate"],
                "mean_pd": float(g["_p"].mean()),
                "auc": metrics["roc_auc"],
                "ks": metrics["ks"],
                "max_feature_psi": max_psi,
                "score_psi": pred["psi_scores"],
            }
        )
    series = sorted(series, key=lambda r: r["vintage"])
    return {
        "reference_n": int(len(ref)),
        "reference_default_rate": float(ref["_y"].mean()),
        "reference_mean_pd": float(ref["_p"].mean()),
        "series": series,
        "latest_feature_psi": characteristic_stability_index(
            ref[feature_cols], frame.iloc[-min(len(frame), 50000) :][feature_cols], feature_cols
        ),
    }


def alert_summary(series: list[dict], cfg: dict) -> list[dict]:
    mon = cfg.get("monitoring") or {}
    alerts = []
    if not series:
        return alerts
    base_auc = np.median([r["auc"] for r in series[: max(3, len(series) // 5)]])
    for r in series:
        reasons = []
        if r["max_feature_psi"] >= float(mon.get("psi_alert", 0.25)):
            reasons.append("feature_psi")
        elif r["max_feature_psi"] >= float(mon.get("psi_warn", 0.10)):
            reasons.append("feature_psi_warn")
        if r["score_psi"] >= float(mon.get("psi_alert", 0.25)):
            reasons.append("prediction_drift")
        if base_auc - r["auc"] >= float(mon.get("auc_drop_alert", 0.03)):
            reasons.append("performance_drift")
        if reasons:
            alerts.append({"vintage": r["vintage"], "reasons": reasons, **r})
    return alerts
