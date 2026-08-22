"""Phase 13: lightweight model registry and governance metadata."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from src.config import resolve_path


def write_registry(entry: dict) -> Path:
    path = resolve_path("models") / "model_registry.json"
    history = []
    if path.exists():
        history = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(history, dict):
            history = history.get("models") or []
    entry = dict(entry)
    entry["registered_at"] = datetime.now(timezone.utc).isoformat()
    history.append(entry)
    payload = {"models": history, "champion": entry.get("champion_model"), "active_version": entry.get("version")}
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def write_governance_pack(cfg: dict, metrics: dict, limitations: list[str]) -> Path:
    path = resolve_path("reports") / "governance_pack.json"
    pack = {
        "model_purpose": (cfg.get("business") or {}).get("objective"),
        "target_definition": cfg.get("target"),
        "excluded_leakage_features": (cfg.get("data") or {}).get("exclude_features"),
        "champion": metrics.get("champion"),
        "performance_summary": {
            k: metrics.get(k)
            for k in ("logistic_regression", "random_forest", "xgboost")
            if k in metrics
        },
        "validation_window": {
            "train": [metrics.get("train_start"), metrics.get("train_end")],
            "test": [metrics.get("test_start"), metrics.get("test_end")],
        },
        "limitations": limitations,
        "owners": {
            "model_owner": "Credit Risk Data Science",
            "validator": "Independent Model Validation (placeholder)",
            "business_owner": "Consumer Credit Risk",
        },
        "retraining_triggers": [
            "PSI alert sustained across 2 vintages",
            "AUC drop beyond threshold",
            "Material policy or population change",
            "Scheduled annual review",
        ],
    }
    path.write_text(json.dumps(pack, indent=2, default=str), encoding="utf-8")
    return path
