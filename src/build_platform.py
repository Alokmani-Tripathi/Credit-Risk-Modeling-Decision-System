"""Build all production-platform artifacts from trained models + Lending Club data."""

from __future__ import annotations

import json
import warnings

import joblib
import numpy as np
import pandas as pd

from src.business import business_summary
from src.calibration import calibrate_and_compare
from src.config import load_config, resolve_path
from src.data import load_dataset
from src.data_quality import build_data_quality_report
from src.evaluation import (
    decile_table,
    discrimination_report,
    lift_gain_curve,
    threshold_scan,
)
from src.explainability import shap_global_linear, shap_global_tree
from src.monitoring import alert_summary, vintage_monitoring
from src.preprocess import add_engineered_features, candidate_frame, make_target, time_based_split
from src.quantification import portfolio_el, stress_scenarios
from src.registry import write_governance_pack, write_registry
from src.scorecard import ScorecardConfig, build_scorecard_from_woe_lr
from src.validation import model_limitations, validation_checklist, variance_inflation_factors


def _save(name: str, obj) -> None:
    path = resolve_path("models") / name
    if name.endswith(".json"):
        path.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
    else:
        joblib.dump(obj, path)
    reports = resolve_path("reports")
    reports.mkdir(parents=True, exist_ok=True)
    if name.endswith(".json"):
        (reports / name).write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")


def build_platform_artifacts(cfg: dict | None = None) -> dict:
    warnings.filterwarnings("ignore")
    cfg = cfg or load_config()
    models_dir = resolve_path("models")
    schema = json.loads((models_dir / "schema.json").read_text(encoding="utf-8"))
    metrics = json.loads((models_dir / "metrics.json").read_text(encoding="utf-8"))
    feature_cols = schema["feature_columns"]
    champion = metrics.get("champion", "xgboost")

    print("Loading data for platform artifacts...")
    df, source = load_dataset(cfg)
    df = add_engineered_features(df)
    y = make_target(df)
    df = df.assign(default_flag=y)
    train_df, test_df = time_based_split(df, cfg["split"]["test_size"], cfg["split"]["time_column"])
    x_train = candidate_frame(train_df)[feature_cols]
    x_test = candidate_frame(test_df)[feature_cols]
    y_train = train_df["default_flag"].to_numpy()
    y_test = test_df["default_flag"].to_numpy()

    pipes = {
        name: joblib.load(models_dir / f"{name}.joblib")
        for name in ("logistic_regression", "random_forest", "xgboost")
    }

    # --- Data quality ---
    print("Data quality & EDA...")
    dq = build_data_quality_report(train_df, test_df, feature_cols, y_train, y_test)
    _save("data_quality.json", dq)

    # --- VIF ---
    print("VIF...")
    vif = variance_inflation_factors(x_train).to_dict(orient="records")
    _save("vif.json", vif)

    # --- Evaluation packs per model ---
    print("Evaluation packs...")
    eval_pack = {}
    probs = {}
    for name, pipe in pipes.items():
        p_test = pipe.predict_proba(x_test)[:, 1]
        p_train = pipe.predict_proba(x_train)[:, 1]
        probs[name] = {"train": p_train, "test": p_test}
        eval_pack[name] = {
            **discrimination_report(y_test, p_test),
            "deciles": decile_table(y_test, p_test).to_dict(orient="records"),
            "lift_gain": lift_gain_curve(y_test, p_test),
            "threshold_scan": threshold_scan(y_test, p_test),
            "encoding": "woe" if name == "logistic_regression" else "raw",
        }
    _save("evaluation_pack.json", eval_pack)

    # --- Calibration on champion ---
    print("Calibration...")
    cal = calibrate_and_compare(y_train, probs[champion]["train"], y_test, probs[champion]["test"])
    cal_save = {
        "champion_model": champion,
        "raw": cal["raw"],
        "methods": cal["methods"],
        "champion_method": cal["champion_method"],
    }
    _save("calibration_pack.json", cal_save)
    joblib.dump(cal["calibrators"], models_dir / "calibrators.joblib")

    # --- Scorecard from WoE LR ---
    print("Scorecard...")
    lr_pipe = pipes["logistic_regression"]
    woe = lr_pipe.named_steps["prep"]
    lr_model = lr_pipe.named_steps["model"]
    woe_specs = getattr(woe, "specs_", {})
    sc_cfg = ScorecardConfig(
        base_score=int(cfg["decision"].get("base_score", 600)),
        base_odds=float(cfg["decision"].get("base_odds", 50)),
        pdo=float(cfg["decision"].get("pdo", 20)),
    )
    scorecard = build_scorecard_from_woe_lr(
        feature_cols,
        lr_model.coef_.ravel(),
        float(lr_model.intercept_[0]),
        woe_specs,
        sc_cfg,
    )
    _save("scorecard.json", scorecard)

    # --- SHAP / explainability ---
    print("Explainability...")
    explain = {}
    try:
        xgb_model = pipes["xgboost"].named_steps["model"]
        # transform through tree preprocessor
        x_test_t = pipes["xgboost"].named_steps["prep"].transform(x_test)
        if not isinstance(x_test_t, pd.DataFrame):
            x_test_t = pd.DataFrame(x_test_t, columns=feature_cols)
        explain["xgboost"] = shap_global_tree(
            xgb_model, x_test_t, sample=int(cfg.get("monitoring", {}).get("shap_sample", 3000))
        )
    except Exception as e:
        explain["xgboost"] = {"error": str(e)}
    try:
        x_woe = woe.transform(x_train)
        if not isinstance(x_woe, pd.DataFrame):
            x_woe = pd.DataFrame(x_woe, columns=feature_cols)
        explain["logistic_regression"] = shap_global_linear(lr_model, x_woe)
    except Exception as e:
        explain["logistic_regression"] = {"error": str(e)}
    _save("explainability.json", explain)

    # --- Quantification & stress ---
    print("Risk quantification & stress...")
    champ_p = probs[champion]["test"]
    # optional calibrated PD
    cal_method = cal["champion_method"]
    champ_p_cal = cal["calibrators"][cal_method].transform(champ_p)
    eads = test_df["loan_amnt"].to_numpy(dtype=float) if "loan_amnt" in test_df.columns else np.full(len(test_df), 10000.0)
    lgd = float(cfg.get("quantification", {}).get("lgd_base", 0.55))
    quant = {
        "raw_pd": portfolio_el(champ_p, eads, lgd),
        "calibrated_pd": portfolio_el(champ_p_cal, eads, lgd),
        "stress": stress_scenarios(champ_p_cal, eads, cfg),
        "calibration_method": cal_method,
    }
    _save("quantification.json", quant)

    # --- Monitoring vintages on test window ---
    print("Monitoring / drift...")
    mon_n = int(cfg.get("monitoring", {}).get("monitoring_sample", 150000))
    mon_df = test_df
    if len(mon_df) > mon_n:
        mon_df = mon_df.sample(n=mon_n, random_state=42)
    mon_x = candidate_frame(mon_df)[feature_cols]
    mon_p = pipes[champion].predict_proba(mon_x)[:, 1]
    mon_p = cal["calibrators"][cal_method].transform(mon_p)
    mon = vintage_monitoring(
        mon_df.reset_index(drop=True),
        mon_df["default_flag"].to_numpy(),
        mon_p,
        feature_cols,
        time_col=cfg["split"]["time_column"],
    )
    mon["alerts"] = alert_summary(mon["series"], cfg)
    mon["champion_model"] = champion
    mon["calibration_method"] = cal_method
    _save("monitoring.json", mon)

    # --- Validation checklist ---
    checks = validation_checklist(metrics, dq.get("psi_train_vs_test") or [], cfg)
    _save("validation_checklist.json", checks)

    # --- Business + governance + registry ---
    biz = business_summary(cfg)
    _save("business_definition.json", biz)
    limitations = model_limitations()
    write_governance_pack(cfg, metrics, limitations)
    write_registry(
        {
            "version": "v1.1-platform",
            "data_source": source,
            "champion_model": champion,
            "calibration": cal_method,
            "features": feature_cols,
            "n_features": len(feature_cols),
            "metrics": {k: metrics.get(k) for k in ("logistic_regression", "random_forest", "xgboost")},
            "artifacts": [
                "data_quality.json",
                "evaluation_pack.json",
                "calibration_pack.json",
                "scorecard.json",
                "explainability.json",
                "quantification.json",
                "monitoring.json",
                "validation_checklist.json",
                "governance_pack.json",
            ],
        }
    )

    summary = {
        "source": source,
        "champion": champion,
        "calibration": cal_method,
        "n_features": len(feature_cols),
        "oot_auc": eval_pack[champion]["roc_auc"],
        "monitoring_vintages": len(mon["series"]),
        "alerts": len(mon["alerts"]),
    }
    _save("platform_summary.json", summary)
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    build_platform_artifacts()
