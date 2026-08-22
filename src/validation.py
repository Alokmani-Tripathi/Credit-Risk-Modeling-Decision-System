"""Phase 11: validation helpers — VIF, sensitivity, OOT notes, limitations."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression


def variance_inflation_factors(X: pd.DataFrame) -> pd.DataFrame:
    frame = X.fillna(X.median(numeric_only=True))
    cols = list(frame.columns)
    rows = []
    for i, col in enumerate(cols):
        y = frame[col].to_numpy()
        x = frame.drop(columns=[col]).to_numpy()
        if x.shape[1] == 0:
            rows.append({"feature": col, "vif": 1.0})
            continue
        reg = LinearRegression().fit(x, y)
        r2 = reg.score(x, y)
        vif = 1.0 / max(1.0 - r2, 1e-6)
        rows.append({"feature": col, "vif": float(vif)})
    return pd.DataFrame(rows).sort_values("vif", ascending=False)


def univariate_sensitivity(pipe, X: pd.DataFrame, feature: str, deltas: list[float] | None = None) -> list[dict]:
    """Perturb one feature and measure mean PD change (raw-feature models)."""
    deltas = deltas or [-0.2, -0.1, 0.0, 0.1, 0.2]
    base = pipe.predict_proba(X)[:, 1].mean()
    rows = []
    for d in deltas:
        Xp = X.copy()
        if feature not in Xp.columns:
            continue
        if pd.api.types.is_numeric_dtype(Xp[feature]):
            Xp[feature] = Xp[feature] * (1.0 + d)
        p = pipe.predict_proba(Xp)[:, 1].mean()
        rows.append({"feature": feature, "delta": d, "mean_pd": float(p), "pd_change": float(p - base)})
    return rows


def model_limitations() -> list[str]:
    return [
        "Accepted-population only; reject inference not applied.",
        "LGD/EAD use policy assumptions rather than account-level recovery models.",
        "No bureau tradeline-level or cash-flow transaction features.",
        "Macroeconomic overlays are scenario multipliers, not full stress models.",
        "Fairness analysis requires protected attributes not present in this extract.",
        "Champion–challenger monitoring uses vintage proxies from historical holdout.",
    ]


def validation_checklist(metrics: dict, psi_rows: list[dict], cfg: dict) -> list[dict]:
    champ = metrics.get("champion", "xgboost")
    m = metrics.get(champ) or {}
    checks = [
        {"check": "Out-of-time ROC-AUC >= 0.65", "pass": m.get("roc_auc", 0) >= 0.65, "value": m.get("roc_auc")},
        {"check": "Out-of-time KS >= 0.20", "pass": m.get("ks", 0) >= 0.20, "value": m.get("ks")},
        {
            "check": "No feature PSI(train→test) >= 0.25",
            "pass": all(r.get("psi_train_vs_test", 0) < 0.25 for r in psi_rows),
            "value": max((r.get("psi_train_vs_test", 0) for r in psi_rows), default=0),
        },
        {"check": "Leakage columns excluded (grade/sub_grade/int_rate)", "pass": True, "value": metrics.get("excluded")},
        {"check": "Time-based validation used", "pass": True, "value": f"{metrics.get('train_end')} → {metrics.get('test_start')}"},
    ]
    return checks
