"""
Layer 3 — Python AI API (risk score, fraud, analysis).
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .scorer import ScoreResult, score_from_features

app = FastAPI(title="CREDRA AI", version="0.1.0")


class ScoreBody(BaseModel):
    monthly_income: float = Field(0, ge=0)
    monthly_spend: float = Field(0, ge=0)
    tx_count: int = Field(0, ge=0)
    volatility_hint: float = Field(0, ge=0, le=1)


def _to_dict(r: ScoreResult) -> dict:
    return {
        "score": r.score,
        "risk_band": r.risk_band,
        "default_risk": r.default_risk,
        "fraud_probability": r.fraud_probability,
        "notes": r.notes,
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "layer": "ai"}


@app.post("/score")
def score(body: ScoreBody) -> dict:
    r = score_from_features(
        monthly_income=body.monthly_income,
        monthly_spend=body.monthly_spend,
        tx_count=body.tx_count,
        volatility_hint=body.volatility_hint,
    )
    return _to_dict(r)


@app.post("/fraud-check")
def fraud_check(body: ScoreBody) -> dict:
    r = score_from_features(
        monthly_income=body.monthly_income,
        monthly_spend=body.monthly_spend,
        tx_count=body.tx_count,
        volatility_hint=body.volatility_hint,
    )
    return {
        "fraud_probability": r.fraud_probability,
        "score": r.score,
        "risk_band": r.risk_band,
    }


@app.post("/risk-analysis")
def risk_analysis(body: ScoreBody) -> dict:
    r = score_from_features(
        monthly_income=body.monthly_income,
        monthly_spend=body.monthly_spend,
        tx_count=body.tx_count,
        volatility_hint=body.volatility_hint,
    )
    return {
        "analysis": {
            "headline": f"Risk band: {r.risk_band}",
            "score": r.score,
            "default_risk": r.default_risk,
            "fraud_probability": r.fraud_probability,
        },
        "notes": r.notes,
    }
