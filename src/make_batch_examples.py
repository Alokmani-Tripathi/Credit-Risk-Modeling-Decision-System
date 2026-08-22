"""Create synthetic batch CSVs for Batch Scoring & Drift demos."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from src.config import load_config, resolve_path
from src.data import load_dataset
from src.preprocess import add_engineered_features, candidate_frame, time_based_split


OUTPUT_COLS = [
    "loan_amnt",
    "term",
    "annual_inc",
    "dti",
    "fico_range_low",
    "emp_length",
    "home_ownership",
    "mort_acc",
    "acc_open_past_24mths",
    "num_actv_rev_tl",
    "mths_since_recent_inq",
    "mths_since_recent_bc",
    "mo_sin_old_rev_tl_op",
    "mo_sin_rcnt_tl",
    "avg_cur_bal",
    "tot_cur_bal",
    "total_bc_limit",
    "verification_status",
    "purpose",
]


def _clip(a, lo, hi):
    return np.clip(a, lo, hi)


def _synthesize(n: int, rng: np.random.Generator, mode: str) -> pd.DataFrame:
    """mode: 'stable' ~ train-like; 'drift' = material population shift."""
    if mode == "stable":
        fico = rng.normal(695, 31, n)
        annual_inc = rng.lognormal(np.log(65000), 0.45, n)
        dti = rng.normal(18.0, 8.5, n)
        term = rng.choice([36, 60], n, p=[0.76, 0.24])
        mortgage_p = 0.49
        acc24 = rng.normal(4.6, 3.0, n)
        avg_bal = rng.lognormal(np.log(7500), 0.9, n)
        bc_lim = rng.lognormal(np.log(15000), 0.85, n)
        loan_mult = 0.22
        inq = rng.normal(6.5, 5.5, n)
        rcnt = rng.normal(8.0, 8.5, n)
        old_rev = rng.normal(183, 90, n)
        mort = rng.poisson(1.5, n)
        act_rev = rng.normal(5.7, 3.1, n)
        recent_bc = rng.normal(24, 28, n)
        emp = rng.integers(0, 11, n)
    else:
        # Significant drift: riskier, thinner credit, more 60m, lower FICO/income, higher DTI
        fico = rng.normal(655, 28, n)
        annual_inc = rng.lognormal(np.log(42000), 0.40, n)
        dti = rng.normal(28.5, 9.0, n)
        term = rng.choice([36, 60], n, p=[0.35, 0.65])
        mortgage_p = 0.18
        acc24 = rng.normal(8.5, 3.5, n)
        avg_bal = rng.lognormal(np.log(2800), 0.85, n)
        bc_lim = rng.lognormal(np.log(5500), 0.80, n)
        loan_mult = 0.38
        inq = rng.normal(2.0, 2.5, n)  # more recent inquiries (lower months)
        rcnt = rng.normal(2.5, 3.0, n)
        old_rev = rng.normal(95, 50, n)  # thinner/younger credit
        mort = rng.poisson(0.3, n)
        act_rev = rng.normal(9.5, 3.5, n)
        recent_bc = rng.normal(6, 8, n)
        emp = rng.choice(np.arange(0, 11), n, p=[0.15, 0.12, 0.12, 0.10, 0.10, 0.08, 0.08, 0.07, 0.06, 0.06, 0.06])

    annual_inc = _clip(annual_inc, 12000, 400000).round(2)
    fico = _clip(fico, 610, 850).round()
    dti = _clip(dti, 0, 50).round(2)
    loan_amnt = _clip(annual_inc * loan_mult + rng.normal(0, 2000, n), 1000, 40000).round(-2)
    home = np.where(rng.random(n) < mortgage_p, "MORTGAGE", np.where(rng.random(n) < 0.75, "RENT", "OWN"))
    purpose = rng.choice(
        ["debt_consolidation", "credit_card", "home_improvement", "other", "small_business"],
        n,
        p=[0.50, 0.22, 0.10, 0.13, 0.05] if mode == "stable" else [0.35, 0.15, 0.05, 0.20, 0.25],
    )
    verify = rng.choice(["Verified", "Source Verified", "Not Verified"], n, p=[0.34, 0.33, 0.33])

    return pd.DataFrame(
        {
            "loan_amnt": loan_amnt,
            "term": term.astype(float),
            "annual_inc": annual_inc,
            "dti": dti,
            "fico_range_low": fico,
            "emp_length": emp.astype(float),
            "home_ownership": home,
            "mort_acc": _clip(mort, 0, 15).astype(float),
            "acc_open_past_24mths": _clip(acc24, 0, 25).round().astype(float),
            "num_actv_rev_tl": _clip(act_rev, 0, 25).round().astype(float),
            "mths_since_recent_inq": _clip(inq, 0, 36).round().astype(float),
            "mths_since_recent_bc": _clip(recent_bc, 0, 120).round().astype(float),
            "mo_sin_old_rev_tl_op": _clip(old_rev, 12, 600).round().astype(float),
            "mo_sin_rcnt_tl": _clip(rcnt, 0, 120).round().astype(float),
            "avg_cur_bal": _clip(avg_bal, 0, 250000).round(2),
            "tot_cur_bal": _clip(avg_bal * rng.uniform(4, 12, n), 0, 1500000).round(2),
            "total_bc_limit": _clip(bc_lim, 0, 300000).round(2),
            "verification_status": verify,
            "purpose": purpose,
        }
    )[OUTPUT_COLS]


def _from_train_like(ref_raw: pd.DataFrame, n: int, rng: np.random.Generator, jitter: float = 0.02) -> pd.DataFrame:
    """Bootstrap from train with tiny noise → should look stable (low PSI)."""
    sample = ref_raw.sample(n=n, replace=True, random_state=int(rng.integers(0, 1_000_000))).reset_index(drop=True)
    out = sample.copy()
    numeric = [
        "loan_amnt",
        "annual_inc",
        "dti",
        "fico_range_low",
        "mort_acc",
        "acc_open_past_24mths",
        "num_actv_rev_tl",
        "mths_since_recent_inq",
        "mths_since_recent_bc",
        "mo_sin_old_rev_tl_op",
        "mo_sin_rcnt_tl",
        "avg_cur_bal",
        "tot_cur_bal",
        "total_bc_limit",
        "emp_length",
    ]
    for c in numeric:
        if c not in out.columns:
            continue
        vals = pd.to_numeric(out[c], errors="coerce").to_numpy(dtype=float)
        noise = 1.0 + rng.normal(0, jitter, len(vals))
        vals = vals * noise
        if c == "fico_range_low":
            vals = _clip(vals, 610, 850).round()
        elif c == "dti":
            vals = _clip(vals, 0, 50).round(2)
        elif c in {"loan_amnt"}:
            vals = _clip(vals, 1000, 40000).round(-2)
        elif c == "annual_inc":
            vals = _clip(vals, 12000, 500000).round(2)
        elif c == "emp_length":
            vals = _clip(vals, 0, 10).round()
        else:
            vals = np.maximum(vals, 0)
            if c.endswith("_tl") or "mths" in c or c in {"mort_acc", "acc_open_past_24mths", "num_actv_rev_tl"}:
                vals = vals.round()
            else:
                vals = vals.round(2)
        out[c] = vals
    # keep term / home_ownership / categoricals as sampled
    return out[OUTPUT_COLS]


def main():
    cfg = load_config()
    out_dir = resolve_path("data") / "batch_examples"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Reference sample from real train vintage (for PSI in the app)
    print("Building training reference sample...")
    df, _ = load_dataset(cfg)
    df = add_engineered_features(df)
    train_df, _ = time_based_split(df, cfg["split"]["test_size"], cfg["split"]["time_column"])
    schema = json.loads(resolve_path("models/schema.json").read_text(encoding="utf-8"))
    feature_cols = schema["feature_columns"]
    ref = candidate_frame(train_df)
    ref_raw = train_df.copy()
    if "home_ownership" not in ref_raw.columns:
        ref_raw["home_ownership"] = np.where(
            ref_raw.get("home_ownership_MORTGAGE", 0) == 1,
            "MORTGAGE",
            np.where(ref_raw.get("home_ownership_RENT", 0) == 1, "RENT", "OWN"),
        )
    if "verification_status" not in ref_raw.columns:
        ref_raw["verification_status"] = np.where(
            ref_raw.get("verification_status_Source Verified", 0) == 1, "Source Verified", "Not Verified"
        )
    if "purpose" not in ref_raw.columns:
        ref_raw["purpose"] = np.where(ref_raw.get("purpose_small_business", 0) == 1, "small_business", "debt_consolidation")

    for c in OUTPUT_COLS:
        if c not in ref_raw.columns and c in ref.columns:
            ref_raw[c] = ref[c]
        elif c not in ref_raw.columns:
            if c == "home_ownership":
                ref_raw[c] = "RENT"
            elif c == "verification_status":
                ref_raw[c] = "Not Verified"
            elif c == "purpose":
                ref_raw[c] = "debt_consolidation"
            else:
                ref_raw[c] = np.nan

    ref_sample = ref_raw[OUTPUT_COLS].sample(n=min(8000, len(ref_raw)), random_state=42).reset_index(drop=True)
    ref_path = out_dir / "training_reference_sample.csv"
    ref_sample.to_csv(ref_path, index=False)

    ref_feat = candidate_frame(add_engineered_features(ref_sample))
    keep = [c for c in feature_cols if c in ref_feat.columns]
    ref_feat[keep].to_csv(out_dir / "training_reference_features.csv", index=False)
    (resolve_path("models") / "batch_reference_features.csv").write_text(
        ref_feat[keep].to_csv(index=False), encoding="utf-8"
    )

    rng = np.random.default_rng(42)
    no_drift = _from_train_like(ref_sample, 2000, rng, jitter=0.015)
    drifted = _synthesize(2000, np.random.default_rng(99), "drift")

    p1 = out_dir / "batch_no_significant_drift.csv"
    p2 = out_dir / "batch_significant_drift.csv"
    no_drift.to_csv(p1, index=False)
    drifted.to_csv(p2, index=False)

    from src.monitoring import characteristic_stability_index

    def _psi_summary(batch_path: str) -> dict:
        b = pd.read_csv(batch_path)
        bf = candidate_frame(add_engineered_features(b))
        rows = characteristic_stability_index(ref_feat[keep], bf[keep], keep)
        return {
            "max_psi": max(r["psi"] for r in rows),
            "mean_psi": float(np.mean([r["psi"] for r in rows])),
            "n_significant": sum(1 for r in rows if r["psi"] >= 0.25),
            "top": rows[:5],
        }

    s1 = _psi_summary(p1)
    s2 = _psi_summary(p2)
    print("Wrote:", p1)
    print("  PSI summary (vs train ref):", {k: s1[k] for k in ("max_psi", "mean_psi", "n_significant")})
    print("  top:", s1["top"])
    print("Wrote:", p2)
    print("  PSI summary (vs train ref):", {k: s2[k] for k in ("max_psi", "mean_psi", "n_significant")})
    print("  top:", s2["top"])
    print("Reference:", ref_path)


if __name__ == "__main__":
    main()
