"""IV ranking plus correlation filter for a compact origination feature set."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.woe import WoEEncoder


def correlation_drops(X: pd.DataFrame, ranked_features: list[str], threshold: float = 0.8) -> tuple[list[str], list[dict]]:
    corr = X[ranked_features].fillna(X[ranked_features].median()).corr().abs()
    kept: list[str] = []
    dropped: list[dict] = []
    for feat in ranked_features:
        clash = None
        for k in kept:
            rho = float(corr.loc[feat, k])
            if rho >= threshold:
                clash = (k, rho)
                break
        if clash:
            dropped.append({"dropped": feat, "kept": clash[0], "abs_corr": clash[1]})
        else:
            kept.append(feat)
    return kept, dropped


def select_features(
    X: pd.DataFrame,
    y: pd.Series | np.ndarray,
    max_features: int = 18,
    min_features: int = 15,
    min_iv: float = 0.02,
    corr_threshold: float = 0.8,
    n_fine: int = 10,
) -> dict:
    encoder = WoEEncoder(n_fine=n_fine)
    encoder.fit(X, y)
    iv_table = encoder.iv_table()
    ranked = iv_table["feature"].tolist()
    usable = iv_table.loc[iv_table["iv"] >= min_iv, "feature"].tolist()
    if len(usable) < min_features:
        usable = ranked[: max(min_features, max_features)]

    kept, dropped = correlation_drops(X, usable, threshold=corr_threshold)
    if len(kept) > max_features:
        extra = kept[max_features:]
        for feat in extra:
            dropped.append({"dropped": feat, "kept": "max_features_cap", "abs_corr": None})
        kept = kept[:max_features]
    if len(kept) < min_features:
        for feat in ranked:
            if feat in kept:
                continue
            trial, extra_drops = correlation_drops(X, kept + [feat], threshold=corr_threshold)
            if feat in trial:
                kept = trial
                dropped = [d for d in dropped if d["dropped"] != feat]
            if len(kept) >= min_features:
                break

    selected_iv = iv_table[iv_table["feature"].isin(kept)].copy()
    specs = {col: encoder.specs_[col] for col in kept}
    return {
        "selected": kept,
        "iv_table": iv_table,
        "selected_iv": selected_iv,
        "dropped_correlated": dropped,
        "woe_specs": specs,
        "candidate_encoder": encoder,
    }
