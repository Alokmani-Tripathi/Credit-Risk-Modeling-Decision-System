"""Phase 1–2: business strategy and target / outcome definition."""

from __future__ import annotations


LIFECYCLE_PHASES = [
    {"phase": 1, "name": "Business & Risk Strategy", "status": "configured"},
    {"phase": 2, "name": "Target & Outcome Definition", "status": "configured"},
    {"phase": 3, "name": "Data Architecture & Acquisition", "status": "configured"},
    {"phase": 4, "name": "Data Quality & EDA", "status": "implemented"},
    {"phase": 5, "name": "Feature Engineering", "status": "implemented"},
    {"phase": 6, "name": "Feature Selection", "status": "implemented"},
    {"phase": 7, "name": "Model Development", "status": "implemented"},
    {"phase": 8, "name": "Model Evaluation", "status": "implemented"},
    {"phase": 9, "name": "Explainability & Responsible AI", "status": "implemented"},
    {"phase": 10, "name": "PD / LGD / EAD Quantification", "status": "implemented"},
    {"phase": 11, "name": "Calibration & Validation", "status": "implemented"},
    {"phase": 12, "name": "Credit Decision Engine", "status": "implemented"},
    {"phase": 13, "name": "Deployment & Registry", "status": "implemented"},
    {"phase": 14, "name": "Monitoring & Lifecycle", "status": "implemented"},
]


def business_summary(cfg: dict) -> dict:
    b = cfg.get("business") or {}
    t = cfg.get("target") or {}
    d = cfg.get("decision") or {}
    return {
        "product": b.get("product"),
        "objective": b.get("objective"),
        "population": b.get("population"),
        "risk_appetite": b.get("risk_appetite"),
        "kpis": b.get("kpis") or [],
        "default_definition": t.get("default_definition"),
        "good_definition": t.get("good_definition"),
        "observation_window": t.get("observation_window"),
        "performance_window": t.get("performance_window"),
        "reject_inference": t.get("reject_inference"),
        "decision_strategy": {
            "approve_pd": d.get("approve_pd"),
            "refer_pd": d.get("refer_pd"),
            "hard_cut_fico": d.get("hard_cut_fico"),
            "hard_cut_dti": d.get("hard_cut_dti"),
        },
        "fundamental_identity": "EL = PD × LGD × EAD",
    }
