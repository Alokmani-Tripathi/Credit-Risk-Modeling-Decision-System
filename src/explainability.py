"""Phase 9: SHAP explainability and reason-code helpers."""

from __future__ import annotations

import numpy as np
import pandas as pd


def shap_global_tree(model, X: pd.DataFrame, sample: int = 3000, seed: int = 42) -> dict:
    import shap

    frame = X
    if len(frame) > sample:
        frame = frame.sample(n=sample, random_state=seed)
    explainer = shap.TreeExplainer(model)
    values = explainer.shap_values(frame)
    if isinstance(values, list):
        values = values[1]
    mean_abs = np.abs(values).mean(axis=0)
    order = np.argsort(mean_abs)[::-1]
    return {
        "features": [frame.columns[i] for i in order],
        "mean_abs_shap": [float(mean_abs[i]) for i in order],
        "sample_size": int(len(frame)),
        "base_value": float(np.mean(explainer.expected_value) if np.ndim(explainer.expected_value) else explainer.expected_value),
    }


def shap_local_tree(model, X_row: pd.DataFrame, background: pd.DataFrame, sample: int = 500) -> dict:
    import shap

    bg = background
    if len(bg) > sample:
        bg = bg.sample(n=sample, random_state=42)
    explainer = shap.TreeExplainer(model, data=bg)
    values = explainer.shap_values(X_row)
    if isinstance(values, list):
        values = values[1]
    vals = values[0]
    order = np.argsort(np.abs(vals))[::-1]
    return {
        "features": [X_row.columns[i] for i in order],
        "shap_values": [float(vals[i]) for i in order],
        "base_value": float(np.mean(explainer.expected_value) if np.ndim(explainer.expected_value) else explainer.expected_value),
    }


def shap_global_linear(model, X_woe: pd.DataFrame, sample: int = 3000, seed: int = 42) -> dict:
    """Coefficient-based global importance for WoE logistic (exact linear SHAP proxy)."""
    frame = X_woe
    if len(frame) > sample:
        frame = frame.sample(n=sample, random_state=seed)
    coef = np.asarray(model.coef_).ravel()
    # mean |coef * x| as local attribution magnitude
    contrib = np.abs(frame.to_numpy() * coef)
    mean_abs = contrib.mean(axis=0)
    order = np.argsort(mean_abs)[::-1]
    return {
        "features": [frame.columns[i] for i in order],
        "mean_abs_shap": [float(mean_abs[i]) for i in order],
        "coefficients": {frame.columns[i]: float(coef[i]) for i in range(len(coef))},
        "sample_size": int(len(frame)),
        "method": "linear_woe_attribution",
    }


def top_reason_codes(feature_names: list[str], contributions: list[float], k: int = 5) -> list[dict]:
    order = np.argsort(np.abs(contributions))[::-1][:k]
    return [
        {
            "feature": feature_names[i],
            "contribution": float(contributions[i]),
            "direction": "increases_risk" if contributions[i] > 0 else "decreases_risk",
        }
        for i in order
    ]
