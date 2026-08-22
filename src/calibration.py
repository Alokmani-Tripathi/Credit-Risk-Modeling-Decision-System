"""Phase 11: PD calibration (Platt / isotonic) and reliability diagnostics."""

from __future__ import annotations

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss


class ProbabilityCalibrator:
    def __init__(self, method: str = "isotonic"):
        self.method = method
        self._model = None

    def fit(self, y_true, y_prob):
        y_true = np.asarray(y_true).astype(int)
        y_prob = np.asarray(y_prob).astype(float).reshape(-1, 1)
        if self.method == "platt":
            self._model = LogisticRegression(max_iter=1000)
            self._model.fit(y_prob, y_true)
        else:
            self._model = IsotonicRegression(out_of_bounds="clip")
            self._model.fit(y_prob.ravel(), y_true)
        return self

    def transform(self, y_prob):
        y_prob = np.asarray(y_prob).astype(float)
        if self.method == "platt":
            return self._model.predict_proba(y_prob.reshape(-1, 1))[:, 1]
        return self._model.predict(y_prob)


def reliability_table(y_true, y_prob, n_bins: int = 10) -> list[dict]:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="quantile")
    return [
        {"bin": i + 1, "pred_pd": float(p), "actual_dr": float(a)}
        for i, (p, a) in enumerate(zip(mean_pred, frac_pos))
    ]


def expected_calibration_error(y_true, y_prob, n_bins: int = 10) -> float:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob).astype(float)
    bins = np.quantile(y_prob, np.linspace(0, 1, n_bins + 1))
    bins = np.unique(bins)
    if len(bins) < 3:
        return float(abs(y_true.mean() - y_prob.mean()))
    ids = np.digitize(y_prob, bins[1:-1], right=True)
    ece = 0.0
    n = len(y_true)
    for i in range(ids.max() + 1):
        mask = ids == i
        if mask.sum() == 0:
            continue
        ece += (mask.sum() / n) * abs(y_true[mask].mean() - y_prob[mask].mean())
    return float(ece)


def calibrate_and_compare(y_train, p_train, y_test, p_test) -> dict:
    out = {
        "raw": {
            "brier": float(brier_score_loss(y_test, p_test)),
            "ece": expected_calibration_error(y_test, p_test),
            "reliability": reliability_table(y_test, p_test),
        }
    }
    calibrated = {}
    for method in ("platt", "isotonic"):
        cal = ProbabilityCalibrator(method=method).fit(y_train, p_train)
        p_cal = cal.transform(p_test)
        calibrated[method] = {
            "brier": float(brier_score_loss(y_test, p_cal)),
            "ece": expected_calibration_error(y_test, p_cal),
            "reliability": reliability_table(y_test, p_cal),
            "calibrator": cal,
            "test_probs": p_cal,
        }
    # choose lower ECE
    best = min(calibrated, key=lambda m: calibrated[m]["ece"])
    out["methods"] = {k: {kk: vv for kk, vv in v.items() if kk not in {"calibrator", "test_probs"}} for k, v in calibrated.items()}
    out["champion_method"] = best
    out["calibrators"] = {k: v["calibrator"] for k, v in calibrated.items()}
    out["champion_test_probs"] = calibrated[best]["test_probs"]
    return out
