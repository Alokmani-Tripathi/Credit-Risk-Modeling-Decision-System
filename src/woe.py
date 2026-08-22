"""Custom / monotone binning, WoE encoding, and Information Value."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

EPS = 1e-6
MIN_BIN_SHARE = 0.03


def _woe_iv(n_good: float, n_bad: float, tot_good: float, tot_bad: float) -> tuple[float, float]:
    dist_good = n_good / max(tot_good, EPS)
    dist_bad = n_bad / max(tot_bad, EPS)
    woe = np.log((dist_good + EPS) / (dist_bad + EPS))
    iv = (dist_good - dist_bad) * woe
    return float(woe), float(iv)


def _stats_for_groups(group_ids: np.ndarray, y: np.ndarray, tot_good: float, tot_bad: float) -> list[dict]:
    rows = []
    for gid in np.unique(group_ids):
        mask = group_ids == gid
        n = int(mask.sum())
        n_bad = float(y[mask].sum())
        woe, iv = _woe_iv(n - n_bad, n_bad, tot_good, tot_bad)
        rows.append(
            {
                "group": int(gid),
                "n": n,
                "n_bad": n_bad,
                "bad_rate": n_bad / max(n, 1),
                "woe": woe,
                "iv": iv,
                "fine_ids": [int(gid)],
            }
        )
    rows.sort(key=lambda r: r["group"])
    return rows


def _merge_pair(rows: list[dict], i: int, tot_good: float, tot_bad: float) -> list[dict]:
    a, b = rows[i], rows[i + 1]
    n = a["n"] + b["n"]
    n_bad = a["n_bad"] + b["n_bad"]
    woe, iv = _woe_iv(n - n_bad, n_bad, tot_good, tot_bad)
    merged = {
        "group": a["group"],
        "n": n,
        "n_bad": n_bad,
        "bad_rate": n_bad / max(n, 1),
        "woe": woe,
        "iv": iv,
        "fine_ids": a["fine_ids"] + b["fine_ids"],
    }
    return rows[:i] + [merged] + rows[i + 2 :]


def _coarse_class(rows: list[dict], min_n: int, tot_good: float, tot_bad: float) -> list[dict]:
    rows = [dict(r, fine_ids=list(r["fine_ids"])) for r in rows]
    while len(rows) > 2:
        small = [i for i, r in enumerate(rows) if r["n"] < min_n]
        if not small:
            break
        i = small[0]
        if i == len(rows) - 1:
            i -= 1
        rows = _merge_pair(rows, i, tot_good, tot_bad)

    if len(rows) <= 2:
        return rows
    rates = np.array([r["bad_rate"] for r in rows])
    direction = 1.0 if rates[-1] >= rates[0] else -1.0
    while len(rows) > 2:
        rates = np.array([r["bad_rate"] for r in rows])
        diffs = np.diff(rates) * direction
        bad = np.where(diffs < -1e-12)[0]
        if len(bad) == 0:
            break
        i = int(min(bad, key=lambda k: rows[k]["n"] + rows[k + 1]["n"]))
        rows = _merge_pair(rows, i, tot_good, tot_bad)
    return rows


def _finalize_spec(spec: dict, labels: np.ndarray, yv: np.ndarray, tot_good: float, tot_bad: float) -> dict:
    rows = _stats_for_groups(labels, yv, tot_good, tot_bad)
    min_n = max(int(MIN_BIN_SHARE * len(yv)), 1)
    rows = _coarse_class(rows, min_n, tot_good, tot_bad)
    fine_to_woe = {}
    bins_out = []
    for i, rec in enumerate(rows):
        rec = dict(rec)
        rec["bin"] = i
        bins_out.append(rec)
        for fid in rec["fine_ids"]:
            fine_to_woe[int(fid)] = rec["woe"]
    spec["bins"] = [
        {
            "bin": b["bin"],
            "n": b["n"],
            "n_bad": b["n_bad"],
            "bad_rate": b["bad_rate"],
            "woe": b["woe"],
            "iv": b["iv"],
            "fine_ids": b["fine_ids"],
        }
        for b in bins_out
    ]
    spec["fine_to_woe"] = {str(k): float(v) for k, v in fine_to_woe.items()}
    spec["iv"] = float(sum(b["iv"] for b in bins_out) + spec["missing"]["iv"])
    return spec


def bin_numeric(x: pd.Series, y: pd.Series, n_fine: int = 10) -> dict:
    yv_all = y.to_numpy(dtype=int)
    tot_bad = float(yv_all.sum())
    tot_good = float(len(yv_all) - tot_bad)
    mask = x.notna()
    missing_share = float((~mask).mean())
    spec: dict = {"type": "numeric", "missing_share": missing_share}

    if (~mask).any():
        ym = y[~mask].to_numpy(dtype=int)
        n_bad = float(ym.sum())
        woe, iv = _woe_iv(len(ym) - n_bad, n_bad, tot_good, tot_bad)
        spec["missing"] = {
            "n": int(len(ym)),
            "n_bad": n_bad,
            "bad_rate": n_bad / max(len(ym), 1),
            "woe": woe,
            "iv": iv,
        }
    else:
        spec["missing"] = {"n": 0, "n_bad": 0, "bad_rate": None, "woe": 0.0, "iv": 0.0}

    xv = x[mask].to_numpy(dtype=float)
    yv = y[mask].to_numpy(dtype=int)
    n_unique = int(pd.Series(xv).nunique())

    if n_unique <= 8:
        uniques = np.sort(np.unique(xv))
        labels = np.searchsorted(uniques, xv)
        spec["type"] = "discrete"
        spec["uniques"] = [float(v) for v in uniques]
        spec["edges"] = [float(v) for v in uniques]
        spec = _finalize_spec(spec, labels, yv, tot_good, tot_bad)
        value_to_woe = {}
        for rec in spec["bins"]:
            for fid in rec["fine_ids"]:
                value_to_woe[str(uniques[fid])] = rec["woe"]
        spec["value_to_woe"] = value_to_woe
        return spec

    n_bins = min(max(n_fine, 2), max(n_unique, 2))
    edges = np.unique(np.quantile(xv, np.linspace(0, 1, n_bins + 1)))
    if len(edges) < 3:
        labels = np.zeros(len(xv), dtype=int)
        edges = np.array([float(np.min(xv)), float(np.max(xv))])
    else:
        labels = np.digitize(xv, edges[1:-1], right=True)
    spec["edges"] = [float(v) for v in edges]
    return _finalize_spec(spec, labels, yv, tot_good, tot_bad)


def transform_column(values: pd.Series, spec: dict) -> np.ndarray:
    series = pd.to_numeric(values, errors="coerce")
    woe = np.full(len(series), spec["missing"]["woe"], dtype=float)
    observed = series.notna().to_numpy()
    if not observed.any():
        return woe
    xv = series.to_numpy(dtype=float)[observed]
    default = float(spec["bins"][-1]["woe"]) if spec.get("bins") else 0.0
    if spec.get("type") == "discrete":
        mapping = {float(k): float(v) for k, v in spec.get("value_to_woe", {}).items()}
        woe[observed] = np.array([mapping.get(float(v), default) for v in xv], dtype=float)
        return woe
    edges = np.asarray(spec["edges"], dtype=float)
    if len(edges) < 3:
        ids = np.zeros(len(xv), dtype=int)
    else:
        ids = np.digitize(xv, edges[1:-1], right=True)
    mapping = {int(k): float(v) for k, v in spec["fine_to_woe"].items()}
    woe[observed] = np.array([mapping.get(int(i), default) for i in ids], dtype=float)
    return woe


class WoEEncoder(BaseEstimator, TransformerMixin):
    """Fit custom/monotone bins on train and transform to WoE."""

    def __init__(self, n_fine: int = 10):
        self.n_fine = n_fine

    def fit(self, X, y):
        frame = pd.DataFrame(X).reset_index(drop=True)
        target = pd.Series(np.asarray(y).astype(int)).reset_index(drop=True)
        self.feature_names_ = list(frame.columns)
        self.specs_ = {col: bin_numeric(frame[col], target, n_fine=self.n_fine) for col in self.feature_names_}
        return self

    def transform(self, X):
        frame = pd.DataFrame(X, columns=getattr(self, "feature_names_", None)).reset_index(drop=True)
        return pd.DataFrame(
            {col: transform_column(frame[col], self.specs_[col]) for col in self.feature_names_}
        )

    def iv_table(self) -> pd.DataFrame:
        rows = []
        for col, spec in self.specs_.items():
            iv = spec["iv"]
            strength = (
                "suspicious"
                if iv >= 0.5
                else "strong"
                if iv >= 0.3
                else "medium"
                if iv >= 0.1
                else "weak"
                if iv >= 0.02
                else "useless"
            )
            rows.append(
                {
                    "feature": col,
                    "iv": iv,
                    "n_bins": len(spec.get("bins", [])),
                    "missing_share": spec.get("missing_share", 0.0),
                    "strength": strength,
                }
            )
        return pd.DataFrame(rows).sort_values("iv", ascending=False).reset_index(drop=True)
