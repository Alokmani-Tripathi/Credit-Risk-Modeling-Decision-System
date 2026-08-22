"""Phase 4: data quality, EDA, leakage and stability checks."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.monitoring import population_stability_index


LEAKAGE_HINTS = {
    "grade",
    "sub_grade",
    "int_rate",
    "total_pymnt",
    "recoveries",
    "collection_recovery_fee",
    "last_pymnt_amnt",
    "out_prncp",
}


def missingness_report(df: pd.DataFrame) -> pd.DataFrame:
    miss = df.isna().mean().sort_values(ascending=False)
    return pd.DataFrame({"feature": miss.index, "missing_rate": miss.values})


def outlier_report(df: pd.DataFrame, cols: list[str] | None = None) -> pd.DataFrame:
    cols = cols or [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    rows = []
    for c in cols:
        s = pd.to_numeric(df[c], errors="coerce")
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0 or np.isnan(iqr):
            continue
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        rate = float(((s < lo) | (s > hi)).mean())
        rows.append({"feature": c, "outlier_rate_iqr": rate, "p01": float(s.quantile(0.01)), "p99": float(s.quantile(0.99))})
    return pd.DataFrame(rows).sort_values("outlier_rate_iqr", ascending=False)


def target_summary(y: pd.Series | np.ndarray) -> dict:
    y = pd.Series(y).astype(int)
    return {
        "n": int(len(y)),
        "default_rate": float(y.mean()),
        "goods": int((y == 0).sum()),
        "bads": int((y == 1).sum()),
        "bad_good_odds": float(((y == 0).sum()) / max((y == 1).sum(), 1)),
    }


def leakage_flags(columns: list[str]) -> list[dict]:
    flags = []
    for c in columns:
        if c in LEAKAGE_HINTS or any(h in c.lower() for h in ("pymnt", "recover", "collection", "out_prncp")):
            flags.append({"column": c, "risk": "high", "reason": "Likely post-origination / LC pricing leakage"})
    return flags


def numeric_describe(df: pd.DataFrame, cols: list[str], max_cols: int = 20) -> pd.DataFrame:
    use = [c for c in cols if c in df.columns][:max_cols]
    return df[use].describe(percentiles=[0.01, 0.25, 0.5, 0.75, 0.99]).T.reset_index(names="feature")


def correlation_matrix(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    use = [c for c in cols if c in df.columns]
    return df[use].fillna(df[use].median(numeric_only=True)).corr()


def build_data_quality_report(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    feature_cols: list[str],
    y_train,
    y_test,
) -> dict:
    train_x = train_df[feature_cols] if set(feature_cols).issubset(train_df.columns) else train_df
    test_x = test_df[feature_cols] if set(feature_cols).issubset(test_df.columns) else test_df
    psi_rows = []
    for c in feature_cols:
        if c not in train_x.columns:
            continue
        try:
            psi = population_stability_index(train_x[c], test_x[c])
            psi_rows.append({"feature": c, "psi_train_vs_test": psi, "status": _psi_status(psi)})
        except Exception:
            continue
    return {
        "train_target": target_summary(y_train),
        "test_target": target_summary(y_test),
        "missingness_train": missingness_report(train_x).to_dict(orient="records"),
        "outliers_train": outlier_report(train_x).head(20).to_dict(orient="records"),
        "leakage_flags": leakage_flags(list(train_df.columns)),
        "psi_train_vs_test": psi_rows,
        "describe_train": numeric_describe(train_x, feature_cols).to_dict(orient="records"),
    }


def _psi_status(psi: float) -> str:
    if psi < 0.1:
        return "stable"
    if psi < 0.25:
        return "shift"
    return "significant"
