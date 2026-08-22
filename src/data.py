"""Load Lending Club data, preferring the uploaded cleaned file."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.config import load_config, resolve_path

PREFERRED_FILES = [
    "xgb_credit_data_clean.csv",
    "accepted_2007_to_2018Q4.csv",
    "lending_club_demo.csv",
]

LEAKAGE_COLS = {
    "id",
    "member_id",
    "url",
    "desc",
    "title",
    "emp_title",
    "zip_code",
    "out_prncp",
    "out_prncp_inv",
    "total_pymnt",
    "total_pymnt_inv",
    "total_rec_prncp",
    "total_rec_int",
    "total_rec_late_fee",
    "recoveries",
    "collection_recovery_fee",
    "last_pymnt_d",
    "last_pymnt_amnt",
    "next_pymnt_d",
    "last_credit_pull_d",
    "collections_12_mths_ex_med",
    "mths_since_last_major_derog",
    "policy_code",
    "hardship_flag",
    "hardship_type",
    "debt_settlement_flag",
    "settlement_status",
    "pymnt_plan",
}

DEFAULT_EXCLUDE = ["grade", "sub_grade", "int_rate"]


def _parse_term(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.extract(r"(\d+)", expand=False)
        .astype(float)
        .fillna(36)
    )


def _parse_emp_length(series: pd.Series) -> pd.Series:
    mapping = {
        "< 1 year": 0,
        "1 year": 1,
        "2 years": 2,
        "3 years": 3,
        "4 years": 4,
        "5 years": 5,
        "6 years": 6,
        "7 years": 7,
        "8 years": 8,
        "9 years": 9,
        "10+ years": 10,
    }
    cleaned = series.astype(str).str.strip()
    return cleaned.map(mapping).fillna(pd.to_numeric(cleaned, errors="coerce")).fillna(0)


def _parse_percent(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.replace("%", "", regex=False)
        .replace({"nan": np.nan, "None": np.nan})
    ).astype(float)


def _resolve_raw_path(cfg: dict):
    raw_dir = resolve_path(cfg["data"]["raw_dir"])
    raw_dir.mkdir(parents=True, exist_ok=True)
    configured = raw_dir / cfg["data"]["filename"]
    if configured.exists():
        return configured
    for name in PREFERRED_FILES:
        candidate = raw_dir / name
        if candidate.exists() and name != "lending_club_demo.csv":
            return candidate
    demo = raw_dir / "lending_club_demo.csv"
    return demo if demo.exists() else None


def _standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "term" in out.columns and out["term"].dtype == object:
        out["term"] = _parse_term(out["term"])
    if "emp_length" in out.columns and out["emp_length"].dtype == object:
        out["emp_length"] = _parse_emp_length(out["emp_length"])
    if "int_rate" in out.columns and out["int_rate"].dtype == object:
        out["int_rate"] = _parse_percent(out["int_rate"])
    if "revol_util" in out.columns and out["revol_util"].dtype == object:
        out["revol_util"] = _parse_percent(out["revol_util"])
    if "issue_d" in out.columns:
        raw_issue = out["issue_d"]
        parsed = pd.to_datetime(raw_issue, errors="coerce")
        out["issue_d"] = parsed
    for col in out.columns:
        if out[col].dtype == bool:
            out[col] = out[col].astype(int)
    return out


def _build_target(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    if "loan_default" in df.columns:
        df = df.copy()
        df["loan_status"] = np.where(df["loan_default"] == 1, "Charged Off", "Fully Paid")
        return df
    if "loan_status" not in df.columns:
        raise ValueError("Dataset must include loan_default or loan_status")
    keep = cfg["target"]["keep_statuses"]
    return df[df["loan_status"].isin(keep)].copy()


def load_dataset(cfg: dict | None = None) -> tuple[pd.DataFrame, str]:
    cfg = cfg or load_config()
    path = _resolve_raw_path(cfg)
    n = cfg["data"].get("sample_rows")
    seed = int(cfg["data"]["random_state"])
    exclude = set(cfg["data"].get("exclude_features") or DEFAULT_EXCLUDE)

    if path is None:
        raise FileNotFoundError(
            "No Lending Club file found in data/raw. "
            "Place xgb_credit_data_clean.csv there and rerun training."
        )

    header = pd.read_csv(path, nrows=0)
    usecols = [c for c in header.columns if c not in LEAKAGE_COLS]
    df = pd.read_csv(path, usecols=usecols, low_memory=False)
    source = f"lending_club:{path.name}"

    df = _build_target(df, cfg)
    df = _standardize_columns(df)
    drop_cols = [c for c in exclude if c in df.columns]
    df = df.drop(columns=drop_cols)
    df = df.dropna(subset=["loan_status"])
    if n:
        n = int(n)
        if len(df) > n:
            df = df.sample(n=n, random_state=seed)
    return df.reset_index(drop=True), source
