"""Application-time candidates, engineering, and tree preprocessing."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.model_selection import train_test_split

# Leakage-free origination / bureau fields available at application.
CANDIDATE_FEATURES = [
    "fico_range_low",
    "term",
    "loan_amnt",
    "annual_inc",
    "dti",
    "emp_length",
    "loan_to_income",
    "verification_status_Source Verified",
    "home_ownership_MORTGAGE",
    "home_ownership_RENT",
    "purpose_small_business",
    "mort_acc",
    "acc_open_past_24mths",
    "num_actv_rev_tl",
    "delinq_2yrs",
    "mths_since_recent_bc",
    "mths_since_recent_inq",
    "mo_sin_old_rev_tl_op",
    "mo_sin_rcnt_tl",
    "tot_cur_bal",
    "avg_cur_bal",
    "total_bc_limit",
]


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "home_ownership" in out.columns and "home_ownership_MORTGAGE" not in out.columns:
        out["home_ownership_MORTGAGE"] = (out["home_ownership"] == "MORTGAGE").astype(int)
        out["home_ownership_RENT"] = (out["home_ownership"] == "RENT").astype(int)
    if "verification_status" in out.columns and "verification_status_Source Verified" not in out.columns:
        out["verification_status_Source Verified"] = (
            out["verification_status"] == "Source Verified"
        ).astype(int)
    if "purpose" in out.columns and "purpose_small_business" not in out.columns:
        out["purpose_small_business"] = (out["purpose"] == "small_business").astype(int)

    out["annual_inc"] = pd.to_numeric(out.get("annual_inc"), errors="coerce").clip(lower=1)
    if "loan_amnt" in out.columns:
        out["loan_to_income"] = out["loan_amnt"] / out["annual_inc"]

    for col in out.columns:
        if out[col].dtype == bool:
            out[col] = out[col].astype(int)
    return out


def make_target(df: pd.DataFrame, positive_label: str = "Charged Off") -> pd.Series:
    if "loan_default" in df.columns:
        return pd.to_numeric(df["loan_default"], errors="coerce").fillna(0).astype(int)
    return (df["loan_status"] == positive_label).astype(int)


def candidate_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = add_engineered_features(df)
    cols = [c for c in CANDIDATE_FEATURES if c in out.columns]
    return out[cols].apply(pd.to_numeric, errors="coerce")


def align_features(df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    out = add_engineered_features(df)
    for col in feature_cols:
        if col not in out.columns:
            out[col] = np.nan
    return out[feature_cols].apply(pd.to_numeric, errors="coerce")


def time_based_split(df: pd.DataFrame, test_size: float = 0.2, time_col: str = "issue_d"):
    if time_col in df.columns and df[time_col].notna().any():
        ordered = df.sort_values(time_col)
        cut = int(len(ordered) * (1 - test_size))
        return ordered.iloc[:cut], ordered.iloc[cut:]
    strat = df["loan_status"] if "loan_status" in df.columns else None
    return train_test_split(df, test_size=test_size, random_state=42, stratify=strat)


class TreePreprocessor(BaseEstimator, TransformerMixin):
    """Median impute + 1st/99th percentile winsorization for tree models."""

    def __init__(self, lower: float = 0.01, upper: float = 0.99):
        self.lower = lower
        self.upper = upper

    def fit(self, X, y=None):
        frame = pd.DataFrame(X)
        self.feature_names_ = list(frame.columns)
        self.medians_ = frame.median(numeric_only=True)
        self.lo_ = frame.quantile(self.lower)
        self.hi_ = frame.quantile(self.upper)
        return self

    def transform(self, X):
        frame = pd.DataFrame(X, columns=getattr(self, "feature_names_", None))
        frame = frame.fillna(self.medians_)
        return frame.clip(lower=self.lo_, upper=self.hi_, axis=1)
