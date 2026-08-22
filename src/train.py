"""Train LR (WoE scorecard) and tree models on a screened origination feature set."""

from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    classification_report,
    roc_auc_score,
    roc_curve,
)
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from src.config import load_config, resolve_path
from src.data import load_dataset
from src.preprocess import (
    TreePreprocessor,
    add_engineered_features,
    candidate_frame,
    make_target,
    time_based_split,
)
from src.selection import select_features
from src.woe import WoEEncoder


def _ks_statistic(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    order = np.argsort(y_prob)
    y = y_true[order]
    n_pos = y.sum()
    n_neg = len(y) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.0
    cdf_pos = np.cumsum(y) / n_pos
    cdf_neg = np.cumsum(1 - y) / n_neg
    return float(np.max(np.abs(cdf_pos - cdf_neg)))


def _gini(auc: float) -> float:
    return 2 * auc - 1


def evaluate(y_true, y_prob, threshold: float = 0.5) -> dict:
    y_pred = (y_prob >= threshold).astype(int)
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    auc = float(roc_auc_score(y_true, y_prob))
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    idx = np.linspace(0, len(fpr) - 1, num=min(150, len(fpr))).astype(int)
    return {
        "roc_auc": auc,
        "gini": _gini(auc),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "ks": _ks_statistic(np.asarray(y_true), np.asarray(y_prob)),
        "brier": float(brier_score_loss(y_true, y_prob)),
        "default_rate": float(np.mean(y_true)),
        "precision_default": float(report["1"]["precision"]),
        "recall_default": float(report["1"]["recall"]),
        "f1_default": float(report["1"]["f1-score"]),
        "accuracy": float(report["accuracy"]),
        "roc_curve": {
            "fpr": fpr[idx].round(4).tolist(),
            "tpr": tpr[idx].round(4).tolist(),
        },
    }


def calibration_table(y_true, y_prob, n_bins: int = 10) -> list[dict]:
    bins = np.quantile(y_prob, np.linspace(0, 1, n_bins + 1))
    bins = np.unique(bins)
    if len(bins) < 3:
        return []
    ids = np.digitize(y_prob, bins[1:-1], right=True)
    rows = []
    for i in range(ids.max() + 1):
        mask = ids == i
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "bin": int(i + 1),
                "n": int(mask.sum()),
                "pred_pd": float(y_prob[mask].mean()),
                "actual_dr": float(y_true[mask].mean()),
            }
        )
    return rows


def feature_importance(pipe: Pipeline, feature_cols: list[str]) -> list[dict]:
    model = pipe.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_
    elif hasattr(model, "coef_"):
        values = np.abs(model.coef_.ravel())
    else:
        return []
    order = np.argsort(values)[::-1]
    return [
        {"feature": feature_cols[i], "importance": float(values[i])}
        for i in order
        if i < len(feature_cols)
    ]


def build_estimators(cfg: dict) -> dict:
    lr_cfg = cfg["models"]["logistic_regression"]
    rf_cfg = cfg["models"]["random_forest"]
    xgb_cfg = cfg["models"]["xgboost"]
    return {
        "logistic_regression": LogisticRegression(
            max_iter=lr_cfg["max_iter"],
            C=lr_cfg["C"],
            solver="lbfgs",
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=rf_cfg["n_estimators"],
            max_depth=rf_cfg["max_depth"],
            min_samples_leaf=rf_cfg["min_samples_leaf"],
            n_jobs=rf_cfg["n_jobs"],
            random_state=42,
        ),
        "xgboost": XGBClassifier(
            n_estimators=xgb_cfg["n_estimators"],
            max_depth=xgb_cfg["max_depth"],
            learning_rate=xgb_cfg["learning_rate"],
            subsample=xgb_cfg["subsample"],
            colsample_bytree=xgb_cfg["colsample_bytree"],
            min_child_weight=xgb_cfg["min_child_weight"],
            reg_lambda=xgb_cfg["reg_lambda"],
            objective="binary:logistic",
            eval_metric="auc",
            n_jobs=-1,
            random_state=42,
        ),
    }


def _pipelines(cfg: dict, n_fine: int) -> dict:
    estimators = build_estimators(cfg)
    return {
        "logistic_regression": Pipeline(
            [
                ("prep", WoEEncoder(n_fine=n_fine)),
                ("model", estimators["logistic_regression"]),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("prep", TreePreprocessor()),
                ("model", estimators["random_forest"]),
            ]
        ),
        "xgboost": Pipeline(
            [
                ("prep", TreePreprocessor()),
                ("model", estimators["xgboost"]),
            ]
        ),
    }


def train_and_save(cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    fs = cfg.get("feature_selection") or {}
    print("Loading Lending Club file...")
    df, source = load_dataset(cfg)
    df = add_engineered_features(df)
    y = make_target(df, cfg["target"]["positive_label"])
    df = df.assign(default_flag=y)

    train_df, test_df = time_based_split(
        df, test_size=cfg["split"]["test_size"], time_col=cfg["split"]["time_column"]
    )
    y_train = train_df["default_flag"].to_numpy()
    y_test = test_df["default_flag"].to_numpy()
    x_train_all = candidate_frame(train_df)
    x_test_all = candidate_frame(test_df)

    print(
        f"Source={source} rows={len(df):,} train={len(train_df):,} test={len(test_df):,} "
        f"candidates={len(x_train_all.columns)} train_dr={y_train.mean():.3f} test_dr={y_test.mean():.3f}"
    )
    print("Selecting features with IV, monotone/custom bins, and |corr| filter (train only)...")
    selection = select_features(
        x_train_all,
        y_train,
        max_features=int(fs.get("max_features", 18)),
        min_features=int(fs.get("min_features", 15)),
        min_iv=float(fs.get("min_iv", 0.02)),
        corr_threshold=float(fs.get("corr_threshold", 0.8)),
        n_fine=int(fs.get("n_fine_bins", 10)),
    )
    feature_cols = selection["selected"]
    print("Selected features:")
    print(selection["selected_iv"].to_string(index=False))
    if selection["dropped_correlated"]:
        print("Dropped for correlation / cap:")
        print(pd.DataFrame(selection["dropped_correlated"]).to_string(index=False))

    x_train = x_train_all[feature_cols]
    x_test = x_test_all[feature_cols]
    n_fine = int(fs.get("n_fine_bins", 10))
    pipes = _pipelines(cfg, n_fine)

    models_dir = resolve_path("models")
    models_dir.mkdir(parents=True, exist_ok=True)
    reports_dir = resolve_path("reports")
    reports_dir.mkdir(parents=True, exist_ok=True)

    metrics = {
        "data_source": source,
        "n_rows": int(len(df)),
        "n_train": int(len(train_df)),
        "n_test": int(len(test_df)),
        "n_candidates": int(x_train_all.shape[1]),
        "n_features": len(feature_cols),
        "features": feature_cols,
        "lr_encoding": "woe_monotone_custom_bins",
        "tree_encoding": "raw_median_impute_winsor_1_99",
        "train_default_rate": float(y_train.mean()),
        "test_default_rate": float(y_test.mean()),
        "train_start": str(train_df["issue_d"].min()) if "issue_d" in train_df else None,
        "train_end": str(train_df["issue_d"].max()) if "issue_d" in train_df else None,
        "test_start": str(test_df["issue_d"].min()) if "issue_d" in test_df else None,
        "test_end": str(test_df["issue_d"].max()) if "issue_d" in test_df else None,
        "excluded": cfg["data"].get("exclude_features", []),
        "corr_threshold": float(fs.get("corr_threshold", 0.8)),
        "min_iv": float(fs.get("min_iv", 0.02)),
    }

    importances = {}
    calibrations = {}
    woe_specs = {}
    for name, pipe in pipes.items():
        print(f"Training {name}...")
        pipe.fit(x_train, y_train)
        proba = pipe.predict_proba(x_test)[:, 1]
        metrics[name] = evaluate(y_test, proba)
        importances[name] = feature_importance(pipe, feature_cols)
        calibrations[name] = calibration_table(y_test, proba)
        joblib.dump(pipe, models_dir / f"{name}.joblib")
        if name == "logistic_regression":
            woe_specs = pipe.named_steps["prep"].specs_
            metrics[name]["encoding"] = "woe"
        else:
            metrics[name]["encoding"] = "raw"
        print(
            f"  AUC={metrics[name]['roc_auc']:.4f} "
            f"KS={metrics[name]['ks']:.4f} Gini={metrics[name]['gini']:.4f}"
        )

    champion = max(
        ("logistic_regression", "random_forest", "xgboost"),
        key=lambda m: metrics[m]["roc_auc"],
    )
    metrics["champion"] = champion
    iv_records = selection["iv_table"].to_dict(orient="records")
    schema = {
        "feature_columns": feature_cols,
        "candidates": list(x_train_all.columns),
        "medians": x_train.median(numeric_only=True).to_dict(),
        "sample_row": x_train.median(numeric_only=True).to_dict(),
    }
    (models_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (models_dir / "schema.json").write_text(json.dumps(schema, default=str, indent=2), encoding="utf-8")
    (models_dir / "importances.json").write_text(json.dumps(importances, indent=2), encoding="utf-8")
    (models_dir / "calibration.json").write_text(json.dumps(calibrations, indent=2), encoding="utf-8")
    (models_dir / "iv_table.json").write_text(json.dumps(iv_records, indent=2), encoding="utf-8")
    (models_dir / "correlation_drops.json").write_text(
        json.dumps(selection["dropped_correlated"], indent=2), encoding="utf-8"
    )
    (models_dir / "woe_bins.json").write_text(json.dumps(woe_specs, indent=2, default=str), encoding="utf-8")
    (reports_dir / "model_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (reports_dir / "iv_table.csv").write_text(selection["iv_table"].to_csv(index=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in metrics.items() if k not in {"features"}}, indent=2, default=str))
    return metrics


if __name__ == "__main__":
    train_and_save()
