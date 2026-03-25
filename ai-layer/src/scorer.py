"""
Layer 3 — Risk scoring: sklearn-normalized features + interpretable rules.
Swap in trained estimators when you have labels.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.preprocessing import normalize


@dataclass
class ScoreResult:
    score: int
    risk_band: str
    default_risk: float
    fraud_probability: float
    notes: list[str]


def _clamp(n: float, lo: float, hi: float) -> float:
    return float(max(lo, min(hi, n)))


def score_from_features(
    monthly_income: float,
    monthly_spend: float,
    tx_count: int,
    volatility_hint: float = 0.0,
) -> ScoreResult:
    notes: list[str] = []
    vec = np.array(
        [[max(monthly_income, 0.0), max(monthly_spend, 0.0), float(max(tx_count, 0))]],
        dtype=float,
    )
    if vec.sum() > 0:
        w = normalize(vec, norm="l1")[0]
    else:
        w = np.array([0.0, 0.0, 0.0], dtype=float)

    ratio = monthly_spend / monthly_income if monthly_income > 0 else 2.0
    ratio = _clamp(ratio, 0.0, 3.0)

    income_strength = _clamp(np.log1p(monthly_income) / np.log1p(500_000), 0.0, 1.0)
    stability = _clamp(1.0 - ratio / 1.5, 0.0, 1.0)
    activity = _clamp(tx_count / 40.0, 0.0, 1.0)
    vol_penalty = _clamp(volatility_hint, 0.0, 1.0)

    # Blend rule-based signals with L1-normalized feature weights (sklearn).
    raw = (
        0.35 * income_strength
        + 0.30 * stability
        + 0.15 * activity
        + 0.12 * float(w[0])
        - 0.08 * float(w[1])
        + 0.05 * float(w[2])
        - 0.25 * vol_penalty
    )
    raw = _clamp(raw, 0.0, 1.0)

    if monthly_income <= 0:
        notes.append("No positive inflow detected in window")
        raw *= 0.65
    if ratio > 1.1:
        notes.append("Spend exceeds income in window")
    if tx_count < 3:
        notes.append("Thin transaction history")

    score = int(round(100 * raw))
    score = max(0, min(100, score))

    if score >= 72:
        band = "low"
    elif score >= 48:
        band = "medium"
    else:
        band = "high"

    default_risk = _clamp(1.0 - raw + 0.15 * vol_penalty, 0.0, 1.0)
    fraud_probability = _clamp(0.08 + 0.35 * vol_penalty + 0.1 * (1.0 - activity), 0.0, 1.0)

    return ScoreResult(
        score=score,
        risk_band=band,
        default_risk=round(default_risk, 4),
        fraud_probability=round(fraud_probability, 4),
        notes=notes,
    )
