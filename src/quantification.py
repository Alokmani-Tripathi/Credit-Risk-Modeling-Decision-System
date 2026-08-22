"""Phase 10: PD / LGD / EAD / EL / UL quantification and risk grades."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd


GRADE_BANDS = [
    (0.04, "A"),
    (0.08, "B"),
    (0.12, "C"),
    (0.18, "D"),
    (0.25, "E"),
    (0.35, "F"),
    (1.01, "G"),
]


@dataclass
class RiskQuant:
    pd: float
    lgd: float
    ead: float
    expected_loss: float
    unexpected_loss: float
    grade: str
    capital_proxy: float


def pd_to_grade(pd_value: float) -> str:
    for cutoff, grade in GRADE_BANDS:
        if pd_value < cutoff:
            return grade
    return "G"


def expected_loss(pd: float, lgd: float, ead: float) -> float:
    return float(pd * lgd * ead)


def unexpected_loss(pd: float, lgd: float, ead: float, multiplier: float = 1.65) -> float:
    """Simple UL proxy: multiplier × sqrt(PD × (1-PD)) × LGD × EAD."""
    pd = min(max(pd, 1e-6), 1 - 1e-6)
    return float(multiplier * math.sqrt(pd * (1 - pd)) * lgd * ead)


def quantify(pd: float, ead: float, cfg: dict, stressed: bool = False) -> RiskQuant:
    q = cfg.get("quantification") or {}
    lgd = float(q.get("lgd_stressed" if stressed else "lgd_base", cfg.get("decision", {}).get("lgd", 0.55)))
    ead = float(ead) * float(q.get("ead_factor", 1.0))
    el = expected_loss(pd, lgd, ead)
    ul = unexpected_loss(pd, lgd, ead, float(q.get("unexpected_loss_multiplier", 1.65)))
    return RiskQuant(
        pd=float(pd),
        lgd=lgd,
        ead=ead,
        expected_loss=el,
        unexpected_loss=ul,
        grade=pd_to_grade(pd),
        capital_proxy=el + ul,
    )


def portfolio_el(pds: np.ndarray, eads: np.ndarray, lgd: float) -> dict:
    pds = np.asarray(pds, dtype=float)
    eads = np.asarray(eads, dtype=float)
    el = pds * lgd * eads
    return {
        "n": int(len(pds)),
        "total_ead": float(eads.sum()),
        "total_el": float(el.sum()),
        "mean_pd": float(pds.mean()),
        "el_rate": float(el.sum() / max(eads.sum(), 1)),
        "by_grade": _by_grade(pds, eads, lgd),
    }


def _by_grade(pds, eads, lgd) -> list[dict]:
    grades = [pd_to_grade(p) for p in pds]
    df = pd.DataFrame({"grade": grades, "pd": pds, "ead": eads})
    df["el"] = df["pd"] * lgd * df["ead"]
    g = df.groupby("grade").agg(n=("pd", "size"), mean_pd=("pd", "mean"), ead=("ead", "sum"), el=("el", "sum")).reset_index()
    return g.to_dict(orient="records")


def stress_scenarios(pds: np.ndarray, eads: np.ndarray, cfg: dict) -> list[dict]:
    """Simple sensitivity / stress: PD uplift and LGD stress."""
    base_lgd = float((cfg.get("quantification") or {}).get("lgd_base", 0.55))
    stress_lgd = float((cfg.get("quantification") or {}).get("lgd_stressed", 0.70))
    scenarios = [
        ("baseline", 1.0, base_lgd),
        ("mild_pd_+20%", 1.2, base_lgd),
        ("severe_pd_+50%", 1.5, base_lgd),
        ("lgd_stress", 1.0, stress_lgd),
        ("combined_severe", 1.5, stress_lgd),
    ]
    rows = []
    for name, pd_mult, lgd in scenarios:
        adj = np.clip(pds * pd_mult, 0, 0.99)
        el = (adj * lgd * eads).sum()
        rows.append(
            {
                "scenario": name,
                "pd_multiplier": pd_mult,
                "lgd": lgd,
                "total_el": float(el),
                "mean_pd": float(adj.mean()),
                "el_vs_baseline": None,
            }
        )
    base = rows[0]["total_el"]
    for r in rows:
        r["el_vs_baseline"] = float(r["total_el"] / max(base, 1) - 1)
    return rows
