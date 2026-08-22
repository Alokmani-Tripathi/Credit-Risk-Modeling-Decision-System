"""FastAPI service for scoring, portfolio monitoring, stress testing, and audit events."""

from __future__ import annotations

import csv
import io
import json
import os
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.config import load_config, resolve_path
from src.decision import decide
from src.preprocess import align_features
from src.scorecard import score_application_points
from src.woe import transform_column

ROOT = Path(__file__).resolve().parents[1]
MODELS = resolve_path("models")
CFG = load_config()
SCHEMA = json.loads((MODELS / "schema.json").read_text(encoding="utf-8"))
SCORECARD = json.loads((MODELS / "scorecard.json").read_text(encoding="utf-8"))
WOE_BINS = json.loads((MODELS / "woe_bins.json").read_text(encoding="utf-8"))
LR_PIPE = joblib.load(MODELS / "logistic_regression.joblib")

app = FastAPI(title="Credit Risk Decision API", version="1.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

portfolio: list[dict[str, Any]] = []
audit_events: list[dict[str, Any]] = []


class SupabaseStore:
    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def enabled(self) -> bool:
        return bool(self.url and self.key)

    def request(self, table: str, method: str = "GET", payload: Any = None, query: str = "") -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.url}/rest/v1/{table}{query}",
            data=body,
            method=method,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else []
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            raise RuntimeError(f"Supabase request failed for {table}: {exc}") from exc


STORE = SupabaseStore()


def load_persisted_portfolio() -> None:
    if not STORE.enabled:
        return
    try:
        rows = STORE.request("portfolio_positions", query="?select=*&order=created_at.asc")
        portfolio.extend([
            {**row, "grade": row.get("grade", row.get("risk_grade", "G")), "ead": float(row.get("ead", row.get("loan_amnt", 0)))}
            for row in rows
        ])
        audit_events.extend(STORE.request("audit_events", query="?select=*&order=created_at.asc&limit=500"))
    except RuntimeError:
        # The service remains usable for health checks while storage is unavailable.
        portfolio.clear()
        audit_events.clear()


class Application(BaseModel):
    loan_amnt: float = Field(gt=0, le=100000)
    term: float = Field(default=36, ge=12, le=84)
    annual_inc: float = Field(gt=0, le=10000000)
    dti: float = Field(ge=0, le=100)
    fico_range_low: float = Field(ge=300, le=850)
    emp_length: float = Field(default=5, ge=0, le=50)
    home_ownership: str = "RENT"
    mort_acc: float = Field(default=0, ge=0)
    acc_open_past_24mths: float = Field(default=0, ge=0)
    num_actv_rev_tl: float = Field(default=0, ge=0)
    mths_since_recent_inq: float = Field(default=0, ge=0)
    mths_since_recent_bc: float = Field(default=0, ge=0)
    mo_sin_old_rev_tl_op: float = Field(default=120, ge=0)
    mo_sin_rcnt_tl: float = Field(default=6, ge=0)
    avg_cur_bal: float = Field(default=0, ge=0)
    tot_cur_bal: float = Field(default=0, ge=0)
    total_bc_limit: float = Field(default=0, ge=0)


class BatchRequest(BaseModel):
    applications: list[Application] = Field(min_length=1, max_length=500)
    source_batch: str = Field(default="api-batch", max_length=120)


class StressRequest(BaseModel):
    pd_multiplier: float = Field(default=1.2, ge=0, le=10)
    lgd: float = Field(default=0.55, ge=0, le=1)
    fico_shift: float = Field(default=0, ge=-200, le=0)
    dti_shift: float = Field(default=0, ge=0, le=100)
    grades: list[str] | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def audit(action: str, details: dict[str, Any]) -> None:
    event = {"event_id": str(uuid.uuid4()), "action": action, "created_at": now(), **details}
    audit_events.append(event)
    if STORE.enabled:
        STORE.request("audit_events", method="POST", payload={"action": action, "details": details})


def app_frame(application: Application) -> pd.DataFrame:
    return align_features(pd.DataFrame([application.model_dump()]), SCHEMA["feature_columns"])


def score_one(application: Application) -> dict[str, Any]:
    frame = app_frame(application)
    pd_value = float(LR_PIPE.predict_proba(frame)[:, 1][0])
    woe = LR_PIPE.named_steps["prep"].transform(frame).iloc[0]
    points = score_application_points(application.model_dump(), SCORECARD, woe)
    decision = decide(application.model_dump(), pd_value, CFG)
    return {**decision.to_dict(), "score": points["score"], "breakdown": points["breakdown"]}


def seed_default_portfolio() -> None:
    if portfolio:
        return
    sample_path = ROOT / "data" / "batch_examples" / "training_reference_sample.csv"
    if not sample_path.exists():
        return
    rows = pd.read_csv(sample_path).fillna(0).head(500).to_dict(orient="records")
    for application_row in rows:
        try:
            application = Application(**application_row)
            result = score_one(application)
        except Exception:
            continue
        if result["decision"] != "APPROVE":
            continue
        portfolio.append({
            **application.model_dump(),
            "portfolio_id": str(uuid.uuid4()),
            "batch_id": "default-portfolio",
            "source_batch": "default-portfolio",
            "added_at": now(),
            "pd": result["pd"],
            "score": result["score"],
            "grade": result["grade"],
            "decision": result["decision"],
            "ead": result["ead"],
            "expected_loss": result["expected_loss"],
            "unexpected_loss": result["unexpected_loss"],
            "capital_proxy": result["capital_proxy"],
        })


load_persisted_portfolio()


def _seed_in_background() -> None:
    """Seed demo portfolio in a background thread so the app can bind to the port immediately."""
    seed_default_portfolio()


if not portfolio:
    threading.Thread(target=_seed_in_background, daemon=True).start()


def portfolio_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ead = sum(float(row["ead"]) for row in rows)
    expected_loss = sum(float(row["expected_loss"]) for row in rows)
    weighted_pd = sum(float(row["pd"]) * float(row["ead"]) for row in rows) / max(ead, 1)
    return {
        "loans": len(rows),
        "ead": ead,
        "weighted_pd": weighted_pd,
        "lgd": float(CFG["quantification"]["lgd_base"]),
        "expected_loss": expected_loss,
        "el_rate": expected_loss / max(ead, 1),
        "average_loan": ead / max(len(rows), 1),
        "unexpected_loss": sum(float(row["unexpected_loss"]) for row in rows),
        "capital_proxy": expected_loss + sum(float(row["unexpected_loss"]) for row in rows),
        "by_grade": [
            {"grade": grade, "loans": len(group), "ead": sum(float(r["ead"]) for r in group), "mean_pd": sum(float(r["pd"]) for r in group) / len(group)}
            for grade in sorted({r["grade"] for r in rows})
            for group in [[r for r in rows if r["grade"] == grade]]
        ],
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "credit-risk-api", "model": "logistic_regression_scorecard", "version": "1.0.0", "storage": "supabase" if STORE.enabled else "memory-demo", "portfolio_loans": len(portfolio)}


@app.get("/api/v1/models/active")
def active_model() -> dict[str, Any]:
    metrics = json.loads((MODELS / "metrics.json").read_text(encoding="utf-8"))
    return {"champion": metrics.get("champion"), "scorecard_model": "logistic_regression", "features": SCHEMA["feature_columns"], "metrics": metrics.get(metrics.get("champion"))}


@app.post("/api/v1/score/single")
def score_single(application: Application) -> dict[str, Any]:
    result = score_one(application)
    audit("score_single", {"decision": result["decision"], "model_version": "v1.1-platform"})
    return result


@app.post("/api/v1/score/batch")
def score_batch(request: BatchRequest) -> dict[str, Any]:
    results = [{"application": app.model_dump(), "result": score_one(app)} for app in request.applications]
    approved = [r for r in results if r["result"]["decision"] == "APPROVE"]
    return {"batch_id": str(uuid.uuid4()), "source_batch": request.source_batch, "scored": len(results), "approved": len(approved), "declined": len(results) - len(approved), "results": results}


@app.get("/api/v1/portfolio/summary")
def get_portfolio() -> dict[str, Any]:
    return portfolio_summary(portfolio)


@app.get("/api/v1/portfolio/positions")
def get_positions() -> dict[str, Any]:
    rows = portfolio[-50000:]
    return {"positions": [{**row, "grade": row.get("grade", row.get("risk_grade"))} for row in rows], "count": len(portfolio)}


@app.get("/api/v1/portfolio/snapshots")
def get_snapshots() -> dict[str, Any]:
    if STORE.enabled:
        rows = STORE.request("portfolio_snapshots", query="?select=*&order=snapshot_date.asc")
        return {"snapshots": [{"date": row["snapshot_date"], **(row.get("metrics") or {}), "mean_pd": (row.get("metrics") or {}).get("weighted_pd", 0)} for row in rows]}
    return {"snapshots": [{"date": row["created_at"], **portfolio_summary(portfolio)} for row in audit_events if row["action"] == "portfolio_batch_added"]}


@app.post("/api/v1/portfolio/batches")
def add_portfolio_batch(request: BatchRequest) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    added = []
    for application in request.applications:
        result = score_one(application)
        if result["decision"] != "APPROVE":
            continue
        record = {**application.model_dump(), "portfolio_id": str(uuid.uuid4()), "batch_id": batch_id, "source_batch": request.source_batch, "added_at": now(), "pd": result["pd"], "score": result["score"], "grade": result["grade"], "decision": result["decision"], "ead": result["ead"], "expected_loss": result["expected_loss"], "unexpected_loss": result["unexpected_loss"], "capital_proxy": result["capital_proxy"]}
        portfolio.append(record)
        added.append(record)
    metrics = portfolio_summary(portfolio)
    if STORE.enabled and added:
        STORE.request("batch_uploads", method="POST", payload={"id": batch_id, "source_batch": request.source_batch, "scored_count": len(request.applications), "approved_count": len(added), "declined_count": len(request.applications) - len(added), "model_version": "v1.1-platform"})
        STORE.request("portfolio_positions", method="POST", payload=[
            {
                "application_id": row["portfolio_id"],
                "batch_id": batch_id,
                "model_version": "v1.1-platform",
                "policy_version": "config.yaml",
                "loan_amnt": row["loan_amnt"],
                "ead": row["ead"],
                "pd": row["pd"],
                "lgd": float(CFG["quantification"]["lgd_base"]),
                "expected_loss": row["expected_loss"],
                "unexpected_loss": row["unexpected_loss"],
                "risk_grade": row["grade"],
                "credit_score": row["fico_range_low"],
                "dti": row["dti"],
            }
            for row in added
        ])
        STORE.request("portfolio_snapshots", method="POST", payload={"snapshot_date": now()[:10], "model_version": "v1.1-platform", "metrics": metrics})
    audit("portfolio_batch_added", {"batch_id": batch_id, "scored": len(request.applications), "added": len(added), "source_batch": request.source_batch})
    return {"batch_id": batch_id, "scored": len(request.applications), "approved": len(added), "added": added, "portfolio": metrics, "storage": "supabase" if STORE.enabled else "memory"}


@app.post("/api/v1/stress/run")
def run_stress(request: StressRequest) -> dict[str, Any]:
    base = portfolio_summary(portfolio)
    stressed_rows = []
    for row in portfolio:
        if request.grades and row["grade"] not in request.grades:
            stressed_rows.append({**row, "pd": row["pd"]})
            continue
        risk_adjustment = max(1, 1 + request.dti_shift * 0.02 + abs(request.fico_shift) * 0.005)
        pd_value = min(float(row["pd"]) * request.pd_multiplier * risk_adjustment, 0.99)
        stressed_rows.append({**row, "pd": pd_value, "expected_loss": pd_value * request.lgd * row["ead"], "unexpected_loss": 1.65 * (pd_value * (1 - pd_value)) ** 0.5 * request.lgd * row["ead"]})
    stressed = portfolio_summary(stressed_rows)
    audit("stress_run", {"assumptions": request.model_dump(), "portfolio_loans": len(portfolio)})
    return {"scenario": request.model_dump(), "baseline": base, "stressed": stressed, "change": {"expected_loss": stressed["expected_loss"] - base["expected_loss"], "el_rate": stressed["el_rate"] - base["el_rate"], "capital_proxy": stressed["capital_proxy"] - base["capital_proxy"]}}


@app.get("/api/v1/audit/events")
def get_audit_events() -> dict[str, Any]:
    return {"events": audit_events[-500:]}


@app.post("/api/v1/score/csv")
async def score_csv(request: Request) -> dict[str, Any]:
    raw = await request.body()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if not rows or len(rows) > 500:
        raise HTTPException(status_code=400, detail="CSV must contain between 1 and 500 application rows")
    return score_batch(BatchRequest(applications=[Application(**row) for row in rows], source_batch="csv-upload"))