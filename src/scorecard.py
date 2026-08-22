"""Phase 10/12: classic points-based credit scorecard from WoE logistic regression."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class ScorecardConfig:
    base_score: int = 600
    base_odds: float = 50.0
    pdo: float = 20.0


def scorecard_scaling(cfg: ScorecardConfig) -> tuple[float, float]:
    """Return (factor, offset) where Score = Offset + Factor * log(odds)."""
    factor = cfg.pdo / math.log(2)
    offset = cfg.base_score - factor * math.log(cfg.base_odds)
    return factor, offset


def build_scorecard_from_woe_lr(
    feature_names: list[str],
    coefficients: np.ndarray,
    intercept: float,
    woe_specs: dict,
    cfg: ScorecardConfig | None = None,
) -> dict:
    cfg = cfg or ScorecardConfig()
    factor, offset = scorecard_scaling(cfg)
    # Points for feature j, bin b: -(woe_b * coef_j) * factor
    # Base points absorb intercept
    base_points = offset - intercept * factor
    variables = []
    for feat, coef in zip(feature_names, coefficients):
        spec = woe_specs.get(feat) or {}
        bins = []
        for b in spec.get("bins") or []:
            woe = float(b.get("woe", 0.0))
            points = -woe * float(coef) * factor
            bins.append(
                {
                    "bin": b.get("bin"),
                    "n": b.get("n"),
                    "bad_rate": b.get("bad_rate"),
                    "woe": woe,
                    "points": float(points),
                    "fine_ids": b.get("fine_ids"),
                }
            )
        miss = spec.get("missing") or {}
        miss_points = -float(miss.get("woe", 0.0)) * float(coef) * factor
        variables.append(
            {
                "feature": feat,
                "coefficient": float(coef),
                "iv": spec.get("iv"),
                "bins": bins,
                "missing_points": float(miss_points),
            }
        )
    return {
        "base_points": float(base_points),
        "factor": float(factor),
        "offset": float(offset),
        "config": {"base_score": cfg.base_score, "base_odds": cfg.base_odds, "pdo": cfg.pdo},
        "variables": variables,
    }


def score_application_points(application: dict, scorecard: dict, woe_row: pd.Series | dict) -> dict:
    """Sum base + per-feature points using WoE-transformed row and scorecard bins."""
    total = float(scorecard["base_points"])
    breakdown = []
    woe_map = woe_row if isinstance(woe_row, dict) else woe_row.to_dict()
    coef_by_feat = {v["feature"]: v["coefficient"] for v in scorecard["variables"]}
    factor = float(scorecard["factor"])
    for v in scorecard["variables"]:
        feat = v["feature"]
        woe = float(woe_map.get(feat, 0.0))
        pts = -woe * coef_by_feat[feat] * factor
        total += pts
        breakdown.append({"feature": feat, "woe": woe, "points": pts})
    return {"score": int(round(total)), "breakdown": breakdown}
