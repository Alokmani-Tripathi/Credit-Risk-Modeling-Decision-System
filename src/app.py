"""End-to-end Credit Risk Modeling & Decision Platform (Streamlit)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import joblib
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.business import LIFECYCLE_PHASES
from src.config import load_config, resolve_path
from src.decision import application_frame, decide
from src.explainability import shap_local_tree, top_reason_codes
from src.preprocess import add_engineered_features, align_features, candidate_frame
from src.quantification import quantify
from src.scorecard import score_application_points

st.set_page_config(
    page_title="Credit Risk Modeling Platform",
    page_icon="🏦",
    layout="wide",
    initial_sidebar_state="expanded",
)

MODELS = {
    "Logistic Regression (WoE Scorecard)": "logistic_regression",
    "Random Forest": "random_forest",
    "XGBoost": "xgboost",
}

SECTIONS = [
    "00 · Lifecycle Overview",
    "01 · Business & Target",
    "02 · Data Quality & EDA",
    "03 · Features (IV / Corr / VIF)",
    "04 · Model Development & Comparison",
    "05 · Evaluation (KS / Deciles / Lift)",
    "06 · Calibration",
    "07 · Explainability (SHAP)",
    "08 · Scorecard",
    "09 · PD / LGD / EAD / EL",
    "10 · Validation & Stress",
    "11 · Decision Engine",
    "12 · Batch Scoring & Drift",
    "13 · Monitoring & Alerts",
    "14 · Governance & Registry",
]


def _read_json(name: str, default=None):
    path = resolve_path("models") / name
    if not path.exists():
        path = resolve_path("reports") / name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default if default is not None else {}


@st.cache_resource
def load_platform():
    cfg = load_config()
    models_dir = resolve_path("models")
    pipes = {}
    for key in MODELS.values():
        p = models_dir / f"{key}.joblib"
        if p.exists():
            pipes[key] = joblib.load(p)
    cals = {}
    cal_path = models_dir / "calibrators.joblib"
    if cal_path.exists():
        cals = joblib.load(cal_path)
    return {
        "cfg": cfg,
        "pipes": pipes,
        "calibrators": cals,
        "metrics": _read_json("metrics.json", {}),
        "schema": _read_json("schema.json", {}),
        "iv_table": _read_json("iv_table.json", []),
        "corr_drops": _read_json("correlation_drops.json", []),
        "dq": _read_json("data_quality.json", {}),
        "vif": _read_json("vif.json", []),
        "evaluation": _read_json("evaluation_pack.json", {}),
        "calibration": _read_json("calibration_pack.json", {}),
        "explain": _read_json("explainability.json", {}),
        "scorecard": _read_json("scorecard.json", {}),
        "quant": _read_json("quantification.json", {}),
        "monitoring": _read_json("monitoring.json", {}),
        "validation": _read_json("validation_checklist.json", []),
        "governance": _read_json("governance_pack.json", {}),
        "registry": _read_json("model_registry.json", {}),
        "business": _read_json("business_definition.json", {}),
        "summary": _read_json("platform_summary.json", {}),
        "importances": _read_json("importances.json", {}),
    }


def sidebar_inputs(schema: dict) -> dict:
    med = schema.get("medians") or {}
    st.sidebar.subheader("Applicant inputs")
    loan_amnt = st.sidebar.number_input("Loan amount ($)", 1000, 40000, int(med.get("loan_amnt", 12000)), 500)
    term = st.sidebar.selectbox("Term", [36, 60])
    annual_inc = st.sidebar.number_input("Annual income ($)", 10000, 500000, int(med.get("annual_inc", 65000)), 1000)
    dti = st.sidebar.slider("DTI", 0.0, 55.0, float(med.get("dti", 18.0)), 0.1)
    fico = st.sidebar.slider("FICO", 610, 850, int(med.get("fico_range_low", 690)))
    emp_length = st.sidebar.slider("Employment length", 0, 10, int(med.get("emp_length", 6) or 6))
    home = st.sidebar.selectbox("Home ownership", ["MORTGAGE", "RENT", "OWN"])
    mort_acc = st.sidebar.number_input("Mortgage accounts", 0, 20, int(med.get("mort_acc", 1) or 0))
    acc24 = st.sidebar.number_input("Accounts opened 24m", 0, 30, int(med.get("acc_open_past_24mths", 4) or 0))
    act_rev = st.sidebar.number_input("Active revolving trades", 0, 30, int(med.get("num_actv_rev_tl", 5) or 0))
    inq = st.sidebar.number_input("Months since recent inquiry", 0, 36, int(med.get("mths_since_recent_inq", 7) or 0))
    bc = st.sidebar.number_input("Months since recent bankcard", 0, 120, int(med.get("mths_since_recent_bc", 24) or 0))
    old_rev = st.sidebar.number_input("Months oldest revolving", 1, 600, int(med.get("mo_sin_old_rev_tl_op", 180) or 180))
    rcnt = st.sidebar.number_input("Months since recent trade", 0, 120, int(med.get("mo_sin_rcnt_tl", 8) or 8))
    avg_bal = st.sidebar.number_input("Avg current balance", 0, 500000, int(med.get("avg_cur_bal", 13000) or 0), 500)
    bc_lim = st.sidebar.number_input("Total bankcard limit", 0, 500000, int(med.get("total_bc_limit", 20000) or 0), 500)
    return {
        "loan_amnt": loan_amnt,
        "term": float(term),
        "annual_inc": annual_inc,
        "dti": dti,
        "fico_range_low": float(fico),
        "emp_length": float(emp_length),
        "home_ownership": home,
        "home_ownership_MORTGAGE": int(home == "MORTGAGE"),
        "home_ownership_RENT": int(home == "RENT"),
        "mort_acc": mort_acc,
        "acc_open_past_24mths": acc24,
        "num_actv_rev_tl": act_rev,
        "mths_since_recent_inq": inq,
        "mths_since_recent_bc": bc,
        "mo_sin_old_rev_tl_op": old_rev,
        "mo_sin_rcnt_tl": rcnt,
        "avg_cur_bal": avg_bal,
        "total_bc_limit": bc_lim,
        "loan_to_income": loan_amnt / max(annual_inc, 1),
        "verification_status_Source Verified": 0,
        "purpose_small_business": 0,
        "delinq_2yrs": 0,
        "tot_cur_bal": avg_bal * 8,
    }


def calibrated_pd(raw_pd: float, calibrators: dict, method: str | None) -> float:
    if not calibrators or not method or method not in calibrators:
        return raw_pd
    return float(calibrators[method].transform(np.array([raw_pd]))[0])


def section_overview(P):
    st.title("Credit Risk Modeling & Decision Platform")
    st.caption(
        "Industry-style end-to-end lifecycle: business definition → data → features → models → "
        "evaluation → calibration → explainability → scorecard → PD/LGD/EAD → validation → "
        "decisioning → monitoring → governance."
    )
    s = P["summary"] or {}
    m = P["metrics"]
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Loans", f"{m.get('n_rows', 0):,}")
    c2.metric("Features", m.get("n_features", s.get("n_features", "—")))
    c3.metric("Champion", m.get("champion", s.get("champion", "—")))
    c4.metric("OOT AUC", f"{(P['evaluation'].get(m.get('champion', 'xgboost'), {}) or {}).get('roc_auc', s.get('oot_auc', 0)):.3f}")
    c5.metric("Calibration", s.get("calibration", P["calibration"].get("champion_method", "—")))

    st.subheader("Lifecycle map (from Credit Risk Modeling Steps)")
    phase_df = pd.DataFrame(LIFECYCLE_PHASES)
    st.dataframe(phase_df, use_container_width=True, hide_index=True)
    if not P["evaluation"]:
        st.warning(
            "Platform artifacts not built yet. Run:\n\n"
            "`python -m src.build_platform`\n\n"
            "after models are trained (`python -m src.train`)."
        )
    st.info(
        "Fundamental identity: **EL = PD × LGD × EAD**. "
        "Build → Validate → Deploy → Monitor, with governance around the whole system."
    )


def section_business(P):
    st.header("Business strategy & target definition")
    b = P["business"] or {}
    st.json(b)
    st.markdown(
        """
        **Decision strategy:** Approve / Refer / Decline using PD thresholds + FICO/DTI policy cuts.  
        **Population:** accepted loans with terminal Fully Paid vs Charged Off.  
        **Reject inference:** not applied on this extract.
        """
    )


def section_dq(P):
    st.header("Data quality & EDA")
    dq = P["dq"]
    if not dq:
        st.warning("Run `python -m src.build_platform` to generate data-quality artifacts.")
        return
    c1, c2 = st.columns(2)
    c1.subheader("Train target")
    c1.json(dq.get("train_target"))
    c2.subheader("Test target")
    c2.json(dq.get("test_target"))
    st.subheader("Missingness")
    st.dataframe(pd.DataFrame(dq.get("missingness_train") or []).head(25), use_container_width=True, hide_index=True)
    st.subheader("Outliers (IQR)")
    st.dataframe(pd.DataFrame(dq.get("outliers_train") or []), use_container_width=True, hide_index=True)
    st.subheader("PSI train → test (population shift)")
    psi = pd.DataFrame(dq.get("psi_train_vs_test") or [])
    if not psi.empty:
        st.dataframe(psi, use_container_width=True, hide_index=True)
        st.plotly_chart(px.bar(psi, x="feature", y="psi_train_vs_test", color="status", title="Feature PSI"), use_container_width=True)
    flags = dq.get("leakage_flags") or []
    st.subheader("Leakage flags")
    st.write(flags if flags else "No residual leakage columns flagged in current ABT.")


def section_features(P):
    st.header("Feature selection — IV, correlation, VIF")
    iv = pd.DataFrame(P["iv_table"] or [])
    selected = set((P["metrics"] or {}).get("features") or [])
    if not iv.empty:
        iv["in_model"] = iv["feature"].isin(selected)
        st.dataframe(iv.style.format({"iv": "{:.4f}", "missing_share": "{:.1%}"}), use_container_width=True, hide_index=True)
        st.plotly_chart(
            px.bar(iv.sort_values("iv"), x="iv", y="feature", color="in_model", orientation="h", title="Information Value"),
            use_container_width=True,
        )
    st.subheader("Correlation drops (|corr| ≥ 0.8)")
    st.dataframe(pd.DataFrame(P["corr_drops"] or []), use_container_width=True, hide_index=True)
    st.subheader("VIF (multicollinearity)")
    vif = pd.DataFrame(P["vif"] or [])
    if not vif.empty:
        st.dataframe(vif.style.format({"vif": "{:.2f}"}), use_container_width=True, hide_index=True)
    st.write("Final features:", ", ".join((P["metrics"] or {}).get("features") or []))


def section_models(P):
    st.header("Model development & champion comparison")
    ev = P["evaluation"] or {}
    rows = []
    for label, key in MODELS.items():
        if key in ev:
            rows.append({"Model": label, "encoding": ev[key].get("encoding"), **{k: ev[key][k] for k in ("roc_auc", "gini", "ks", "pr_auc", "brier", "recall_default", "precision_default")}})
    if rows:
        perf = pd.DataFrame(rows)
        st.dataframe(
            perf.style.format({c: "{:.3f}" for c in perf.columns if c not in {"Model", "encoding"}}),
            use_container_width=True,
            hide_index=True,
        )
        st.plotly_chart(
            px.bar(perf.melt(id_vars="Model", value_vars=["roc_auc", "ks", "gini"], var_name="Metric", value_name="Value"),
                   x="Model", y="Value", color="Metric", barmode="group", title="Discrimination metrics"),
            use_container_width=True,
        )
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", name="Random", line=dict(dash="dash")))
        for label, key in MODELS.items():
            roc = (ev.get(key) or {}).get("roc_curve")
            if roc:
                fig.add_trace(go.Scatter(x=roc["fpr"], y=roc["tpr"], mode="lines", name=label))
        fig.update_layout(title="ROC curves (out-of-time)", xaxis_title="FPR", yaxis_title="TPR")
        st.plotly_chart(fig, use_container_width=True)
    st.caption("LR uses WoE + monotone/custom bins; RF/XGB use screened raw features with winsorization.")


def section_evaluation(P):
    st.header("Deep evaluation — deciles, lift / gain, thresholds")
    champ = (P["metrics"] or {}).get("champion", "xgboost")
    key = st.selectbox("Model", list(MODELS.values()), index=list(MODELS.values()).index(champ) if champ in MODELS.values() else 0)
    ev = (P["evaluation"] or {}).get(key) or {}
    if not ev:
        st.warning("Missing evaluation pack.")
        return
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("AUC", f"{ev['roc_auc']:.3f}")
    c2.metric("KS", f"{ev['ks']:.3f}")
    c3.metric("Gini", f"{ev['gini']:.3f}")
    c4.metric("Brier", f"{ev['brier']:.3f}")
    st.subheader("Decile analysis")
    dec = pd.DataFrame(ev.get("deciles") or [])
    if not dec.empty:
        st.dataframe(dec.style.format({"avg_pd": "{:.3f}", "actual_dr": "{:.3f}", "lift": "{:.2f}", "cum_capture": "{:.2%}"}), use_container_width=True, hide_index=True)
    lg = pd.DataFrame(ev.get("lift_gain") or [])
    if not lg.empty:
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=lg["pct_population"], y=lg["cum_capture"], name="Gains"))
        fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], name="Random", line=dict(dash="dash")))
        fig.update_layout(title="Cumulative gains", xaxis_title="% population (high risk first)", yaxis_title="% defaults captured")
        st.plotly_chart(fig, use_container_width=True)
    thr = pd.DataFrame(ev.get("threshold_scan") or [])
    if not thr.empty:
        st.plotly_chart(px.line(thr, x="threshold", y=["approval_rate", "recall_bad", "precision_bad"], title="Threshold trade-offs"), use_container_width=True)
    st.write("Confusion matrix @ 0.5:", ev.get("confusion_matrix"))


def section_calibration(P):
    st.header("Probability calibration")
    cal = P["calibration"] or {}
    if not cal:
        st.warning("Run platform build for calibration artifacts.")
        return
    st.write(f"Champion model: **{cal.get('champion_model')}** · Best calibrator: **{cal.get('champion_method')}**")
    rows = [{"method": "raw", **cal.get("raw", {})}]
    for m, v in (cal.get("methods") or {}).items():
        rows.append({"method": m, "brier": v.get("brier"), "ece": v.get("ece")})
    st.dataframe(pd.DataFrame([{k: r.get(k) for k in ("method", "brier", "ece")} for r in rows]), use_container_width=True, hide_index=True)
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", name="Perfect", line=dict(dash="dash")))
    raw_rel = pd.DataFrame((cal.get("raw") or {}).get("reliability") or [])
    if not raw_rel.empty:
        fig.add_trace(go.Scatter(x=raw_rel["pred_pd"], y=raw_rel["actual_dr"], mode="lines+markers", name="Raw"))
    for m, v in (cal.get("methods") or {}).items():
        rel = pd.DataFrame(v.get("reliability") or [])
        if not rel.empty:
            fig.add_trace(go.Scatter(x=rel["pred_pd"], y=rel["actual_dr"], mode="lines+markers", name=m))
    fig.update_layout(title="Reliability diagrams", xaxis_title="Predicted PD", yaxis_title="Actual default rate")
    st.plotly_chart(fig, use_container_width=True)


def section_explain(P, application: dict):
    st.header("Explainability — SHAP / attributions")
    ex = P["explain"] or {}
    for model_key, title in (("xgboost", "XGBoost TreeSHAP (global)"), ("logistic_regression", "WoE Logistic attributions")):
        block = ex.get(model_key) or {}
        st.subheader(title)
        if "error" in block:
            st.error(block["error"])
            continue
        if not block.get("features"):
            st.write("No explainability artifact.")
            continue
        df = pd.DataFrame({"feature": block["features"], "mean_abs_shap": block["mean_abs_shap"]}).head(20)
        st.plotly_chart(px.bar(df.sort_values("mean_abs_shap"), x="mean_abs_shap", y="feature", orientation="h", title=title), use_container_width=True)

    st.subheader("Local explanation (current applicant · XGBoost)")
    if "xgboost" in P["pipes"]:
        try:
            pipe = P["pipes"]["xgboost"]
            frame = application_frame(application)
            prep = pipe.named_steps["prep"]
            model = pipe.named_steps["model"]
            row_t = prep.transform(frame)
            if not isinstance(row_t, pd.DataFrame):
                row_t = pd.DataFrame(row_t, columns=frame.columns)
            # small background from schema medians
            bg = pd.DataFrame([P["schema"].get("medians") or {}])[list(frame.columns)]
            bg = prep.transform(bg)
            if not isinstance(bg, pd.DataFrame):
                bg = pd.DataFrame(bg, columns=frame.columns)
            local = shap_local_tree(model, row_t, bg, sample=min(200, len(bg)))
            reasons = top_reason_codes(local["features"], local["shap_values"], k=8)
            st.dataframe(pd.DataFrame(reasons), use_container_width=True, hide_index=True)
        except Exception as e:
            st.warning(f"Local SHAP unavailable: {e}")


def section_scorecard(P, application: dict):
    st.header("Credit scorecard (WoE logistic)")
    sc = P["scorecard"] or {}
    if not sc:
        st.warning("Scorecard not built.")
        return
    st.write(f"Base points: **{sc.get('base_points', 0):.1f}** · PDO={sc.get('config', {}).get('pdo')} · Base odds={sc.get('config', {}).get('base_odds')}")
    if "logistic_regression" in P["pipes"]:
        pipe = P["pipes"]["logistic_regression"]
        frame = application_frame(application)
        woe = pipe.named_steps["prep"].transform(frame)
        if not isinstance(woe, pd.DataFrame):
            woe = pd.DataFrame(woe, columns=frame.columns)
        scored = score_application_points(application, sc, woe.iloc[0])
        st.metric("Applicant scorecard points", scored["score"])
        st.dataframe(pd.DataFrame(scored["breakdown"]), use_container_width=True, hide_index=True)
    st.subheader("Scorecard dictionary")
    for var in sc.get("variables") or []:
        with st.expander(f"{var['feature']} (coef={var['coefficient']:.3f}, IV={var.get('iv')})"):
            st.dataframe(pd.DataFrame(var.get("bins") or []), use_container_width=True, hide_index=True)


def section_quant(P):
    st.header("PD / LGD / EAD / Expected & Unexpected Loss")
    q = P["quant"] or {}
    if not q:
        st.warning("Quantification artifacts missing.")
        return
    c1, c2 = st.columns(2)
    c1.subheader("Portfolio EL (raw PD)")
    c1.json(q.get("raw_pd"))
    c2.subheader("Portfolio EL (calibrated PD)")
    c2.json(q.get("calibrated_pd"))
    stress = pd.DataFrame(q.get("stress") or [])
    if not stress.empty:
        st.subheader("Stress / sensitivity scenarios")
        st.dataframe(stress.style.format({"total_el": "${:,.0f}", "mean_pd": "{:.2%}", "el_vs_baseline": "{:.1%}"}), use_container_width=True, hide_index=True)
        st.plotly_chart(px.bar(stress, x="scenario", y="total_el", title="Total expected loss by scenario"), use_container_width=True)
    grades = pd.DataFrame(((q.get("calibrated_pd") or {}).get("by_grade") or []))
    if not grades.empty:
        st.plotly_chart(px.bar(grades, x="grade", y="el", title="EL by risk grade"), use_container_width=True)


def section_validation(P):
    st.header("Independent validation checklist & limitations")
    checks = pd.DataFrame(P["validation"] or [])
    if not checks.empty:
        st.dataframe(checks, use_container_width=True, hide_index=True)
    gov = P["governance"] or {}
    st.subheader("Model limitations")
    for lim in gov.get("limitations") or []:
        st.write(f"- {lim}")
    st.subheader("Retraining triggers")
    for t in gov.get("retraining_triggers") or []:
        st.write(f"- {t}")


def section_decision(P, application: dict):
    st.header("Credit decision engine")
    if not P["pipes"]:
        st.error("No models loaded.")
        return
    model_label = st.selectbox("Scoring model", list(MODELS.keys()), index=2)
    key = MODELS[model_label]
    raw = float(P["pipes"][key].predict_proba(application_frame(application))[:, 1][0])
    method = (P["calibration"] or {}).get("champion_method")
    use_cal = st.checkbox("Apply probability calibration", value=True)
    pd_hat = calibrated_pd(raw, P["calibrators"], method) if use_cal else raw
    # local reason codes from scorecard points if LR else SHAP-less policy reasons
    result = decide(application, pd_hat, P["cfg"])
    color = {"APPROVE": "green", "REFER": "orange", "DECLINE": "red"}[result.decision]
    a, b, c, d, e, f = st.columns(6)
    a.metric("Decision", result.decision)
    b.metric("PD", f"{result.pd:.1%}")
    c.metric("Grade", result.grade)
    d.metric("Score", result.score)
    e.metric("EL", f"${result.expected_loss:,.0f}")
    f.metric("Limit", f"${result.recommended_limit:,.0f}")
    st.markdown(f":{color}[**{result.decision}**] · Spread **{result.suggested_spread_bps} bps** · UL proxy **${result.unexpected_loss:,.0f}** · Capital proxy **${result.capital_proxy:,.0f}**")
    st.write("EL = PD × LGD × EAD")
    for r in result.reasons:
        st.write(f"- {r}")
    st.subheader("All-model comparison")
    rows = []
    for label, k in MODELS.items():
        rp = float(P["pipes"][k].predict_proba(application_frame(application))[:, 1][0])
        cp = calibrated_pd(rp, P["calibrators"], method) if use_cal and k == (P["metrics"] or {}).get("champion") else rp
        dres = decide(application, cp if k == (P["metrics"] or {}).get("champion") else rp, P["cfg"])
        rows.append({"Model": label, "PD": dres.pd, "Grade": dres.grade, "Score": dres.score, "EL": dres.expected_loss, "Decision": dres.decision, "Limit": dres.recommended_limit})
    st.dataframe(pd.DataFrame(rows).style.format({"PD": "{:.2%}", "EL": "${:,.0f}", "Limit": "${:,.0f}"}), use_container_width=True, hide_index=True)


def section_batch(P):
    st.header("Batch scoring + drift vs training reference")
    st.caption(
        "Demo files: `data/batch_examples/batch_no_significant_drift.csv` and "
        "`data/batch_examples/batch_significant_drift.csv`"
    )
    uploaded = st.file_uploader("Upload applications CSV", type=["csv"])
    key = MODELS[st.selectbox("Batch model", list(MODELS.keys()), index=2)]
    if uploaded is None:
        st.info(
            "Upload a CSV with application-time fields "
            "(loan_amnt, term, annual_inc, dti, fico_range_low, home_ownership, …). "
            "Missing model columns are median-filled."
        )
        return
    raw = pd.read_csv(uploaded)
    cols = (P["schema"] or {}).get("feature_columns") or []
    feat = align_features(raw, cols) if cols else candidate_frame(add_engineered_features(raw))
    probs = P["pipes"][key].predict_proba(feat)[:, 1]
    method = (P["calibration"] or {}).get("champion_method")
    if key == (P["metrics"] or {}).get("champion") and method in P["calibrators"]:
        probs = P["calibrators"][method].transform(probs)

    from src.monitoring import characteristic_stability_index, prediction_drift

    decisions = [decide(row, float(p), P["cfg"]) for row, p in zip(feat.to_dict("records"), probs)]
    scored = raw.copy()
    scored["pd"] = probs
    scored["grade"] = [d.grade for d in decisions]
    scored["score"] = [d.score for d in decisions]
    scored["expected_loss"] = [d.expected_loss for d in decisions]
    scored["decision"] = [d.decision for d in decisions]
    scored["recommended_limit"] = [d.recommended_limit for d in decisions]
    st.dataframe(scored.head(50), use_container_width=True)
    mix = scored["decision"].value_counts().rename_axis("decision").reset_index(name="count")
    st.plotly_chart(px.pie(mix, names="decision", values="count", title="Decision mix"), use_container_width=True)

    # Drift vs saved training reference (or schema medians fallback)
    ref_path = resolve_path("models") / "batch_reference_features.csv"
    alt_ref = resolve_path("data") / "batch_examples" / "training_reference_features.csv"
    ref_feat = None
    if ref_path.exists():
        ref_feat = pd.read_csv(ref_path)
    elif alt_ref.exists():
        ref_feat = pd.read_csv(alt_ref)
    if ref_feat is not None and cols:
        use = [c for c in cols if c in ref_feat.columns and c in feat.columns]
        psi_rows = characteristic_stability_index(ref_feat[use], feat[use], use)
        psi_df = pd.DataFrame(psi_rows)
        max_psi = float(psi_df["psi"].max()) if not psi_df.empty else 0.0
        n_sig = int((psi_df["psi"] >= 0.25).sum()) if not psi_df.empty else 0
        status = "significant" if max_psi >= 0.25 else "shift" if max_psi >= 0.10 else "stable"
        c1, c2, c3 = st.columns(3)
        c1.metric("Max feature PSI", f"{max_psi:.3f}")
        c2.metric("Features with PSI ≥ 0.25", n_sig)
        c3.metric("Drift status", status)
        st.subheader("Feature drift (PSI vs training reference)")
        st.dataframe(psi_df, use_container_width=True, hide_index=True)
        st.plotly_chart(
            px.bar(psi_df, x="feature", y="psi", color="status", title="Batch vs train PSI"),
            use_container_width=True,
        )
        # Prediction drift: compare batch scores to reference model scores
        try:
            ref_probs = P["pipes"][key].predict_proba(ref_feat[use])[:, 1]
            if key == (P["metrics"] or {}).get("champion") and method in P["calibrators"]:
                ref_probs = P["calibrators"][method].transform(ref_probs)
            pred = prediction_drift(ref_probs, probs)
            st.subheader("Prediction drift (score PSI)")
            st.json(pred)
        except Exception as e:
            st.warning(f"Could not compute prediction drift: {e}")
    else:
        st.warning(
            "Training reference not found. Run `python -m src.make_batch_examples` "
            "to create reference + demo CSVs."
        )

    st.download_button("Download scored CSV", scored.to_csv(index=False).encode("utf-8"), "scored_batch.csv", "text/csv")


def section_monitoring(P):
    st.header("Production monitoring — data / prediction / performance drift")
    mon = P["monitoring"] or {}
    series = pd.DataFrame(mon.get("series") or [])
    if series.empty:
        st.warning("No monitoring series. Run `python -m src.build_platform`.")
        return
    c1, c2, c3 = st.columns(3)
    c1.metric("Reference n", mon.get("reference_n"))
    c2.metric("Ref DR", f"{mon.get('reference_default_rate', 0):.1%}")
    c3.metric("Open alerts", len(mon.get("alerts") or []))
    st.plotly_chart(px.line(series, x="vintage", y=["auc", "ks"], title="Performance by vintage"), use_container_width=True)
    st.plotly_chart(px.line(series, x="vintage", y=["default_rate", "mean_pd"], title="Default rate vs mean PD"), use_container_width=True)
    st.plotly_chart(px.line(series, x="vintage", y=["max_feature_psi", "score_psi"], title="PSI — features & scores"), use_container_width=True)
    st.subheader("Alerts")
    alerts = pd.DataFrame(mon.get("alerts") or [])
    if alerts.empty:
        st.success("No alert thresholds breached on monitored vintages.")
    else:
        st.dataframe(alerts, use_container_width=True, hide_index=True)
    st.subheader("Latest feature PSI detail")
    st.dataframe(pd.DataFrame(mon.get("latest_feature_psi") or []), use_container_width=True, hide_index=True)


def section_governance(P):
    st.header("Model registry & governance")
    st.subheader("Registry")
    st.json(P["registry"] or {})
    st.subheader("Governance pack")
    st.json(P["governance"] or {})
    st.markdown(
        """
        **Operating model:** champion–challenger on registry versions · audit trail via scored outputs ·  
        recalibration when ECE/Brier degrades · retrain on sustained PSI / AUC alerts ·  
        independent validation sign-off before promotion.
        """
    )


def main():
    P = load_platform()
    st.sidebar.title("CRM Platform")
    section = st.sidebar.radio("Lifecycle navigation", SECTIONS, index=0)
    application = sidebar_inputs(P["schema"] or {})

    if section.startswith("00"):
        section_overview(P)
    elif section.startswith("01"):
        section_business(P)
    elif section.startswith("02"):
        section_dq(P)
    elif section.startswith("03"):
        section_features(P)
    elif section.startswith("04"):
        section_models(P)
    elif section.startswith("05"):
        section_evaluation(P)
    elif section.startswith("06"):
        section_calibration(P)
    elif section.startswith("07"):
        section_explain(P, application)
    elif section.startswith("08"):
        section_scorecard(P, application)
    elif section.startswith("09"):
        section_quant(P)
    elif section.startswith("10"):
        section_validation(P)
    elif section.startswith("11"):
        section_decision(P, application)
    elif section.startswith("12"):
        section_batch(P)
    elif section.startswith("13"):
        section_monitoring(P)
    elif section.startswith("14"):
        section_governance(P)


if __name__ == "__main__":
    main()
