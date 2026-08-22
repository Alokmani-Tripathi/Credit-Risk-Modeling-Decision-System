"""Phase 12: credit decision engine with policy, limits, pricing, reason codes."""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field

import pandas as pd

from src.config import resolve_path
from src.preprocess import add_engineered_features, align_features
from src.quantification import pd_to_grade, quantify


@dataclass
class DecisionResult:
    pd: float
    lgd: float
    ead: float
    expected_loss: float
    unexpected_loss: float
    score: int
    grade: str
    decision: str
    reasons: list[str]
    recommended_limit: float = 0.0
    suggested_spread_bps: int = 0
    capital_proxy: float = 0.0
    reason_codes: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def load_schema() -> dict:
    path = resolve_path("models") / "schema.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"feature_columns": []}


def pd_to_score(pd_value: float, offset: float = 600, factor: float = 50) -> int:
    pd_value = min(max(pd_value, 1e-6), 1 - 1e-6)
    odds = (1 - pd_value) / pd_value
    return int(round(offset + factor * math.log(odds)))


def _limit_from_risk(loan_amnt: float, pd: float, grade: str, cfg: dict) -> float:
    d = cfg.get("decision") or {}
    max_limit = float(d.get("max_limit", 40000))
    min_limit = float(d.get("min_limit", 1000))
    # haircut by PD / grade
    haircut = max(0.25, 1.0 - pd * 2.5)
    grade_mult = {"A": 1.0, "B": 0.95, "C": 0.85, "D": 0.7, "E": 0.55, "F": 0.4, "G": 0.25}.get(grade, 0.5)
    limit = min(loan_amnt, max_limit) * haircut * grade_mult
    return float(max(min_limit if limit >= min_limit else 0.0, round(limit, -2)))


def decide(application: dict, pd_value: float, cfg: dict, reason_codes: list[dict] | None = None) -> DecisionResult:
    policy = cfg["decision"]
    fico = float(application.get("fico_avg") or application.get("fico_range_low") or 0)
    dti = float(application.get("dti") or 0)
    ead = float(application.get("loan_amnt") or 0)
    reasons: list[str] = []

    if fico < policy["hard_cut_fico"]:
        decision = "DECLINE"
        reasons.append(f"FICO {fico:.0f} below hard cut {policy['hard_cut_fico']}")
    elif dti > policy["hard_cut_dti"]:
        decision = "DECLINE"
        reasons.append(f"DTI {dti:.1f} above hard cut {policy['hard_cut_dti']}")
    elif pd_value >= policy["refer_pd"]:
        decision = "DECLINE"
        reasons.append(f"PD {pd_value:.1%} exceeds decline threshold {policy['refer_pd']:.0%}")
    elif (
        pd_value <= policy["approve_pd"]
        and fico >= policy["min_fico_approve"]
        and dti <= policy["max_dti_approve"]
    ):
        decision = "APPROVE"
        reasons.append("PD, FICO, and DTI all within auto-approve policy")
    else:
        decision = "REFER"
        if pd_value > policy["approve_pd"]:
            reasons.append(f"PD {pd_value:.1%} above auto-approve {policy['approve_pd']:.0%}")
        if fico < policy["min_fico_approve"]:
            reasons.append(f"FICO {fico:.0f} below auto-approve floor {policy['min_fico_approve']}")
        if dti > policy["max_dti_approve"]:
            reasons.append(f"DTI {dti:.1f} above auto-approve cap {policy['max_dti_approve']}")
        if not reasons:
            reasons.append("Manual review recommended")

    quant = quantify(pd_value, ead, cfg, stressed=False)
    grade = quant.grade
    limit = _limit_from_risk(ead, pd_value, grade, cfg) if decision == "APPROVE" else 0.0
    spreads = (policy.get("pricing_spread_bps") or {})
    spread = int(spreads.get(grade, 800))
    if decision == "DECLINE":
        spread = 0

    return DecisionResult(
        pd=float(pd_value),
        lgd=quant.lgd,
        ead=quant.ead,
        expected_loss=quant.expected_loss,
        unexpected_loss=quant.unexpected_loss,
        score=pd_to_score(pd_value, policy["score_offset"], policy["score_factor"]),
        grade=grade,
        decision=decision,
        reasons=reasons,
        recommended_limit=limit,
        suggested_spread_bps=spread,
        capital_proxy=quant.capital_proxy,
        reason_codes=reason_codes or [],
    )


def application_frame(application: dict) -> pd.DataFrame:
    schema = load_schema()
    cols = schema.get("feature_columns") or []
    df = pd.DataFrame([application])
    if cols:
        return align_features(df, cols)
    return add_engineered_features(df)
