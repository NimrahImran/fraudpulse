"""FraudLens API: real-time card fraud scoring with explanations.

Runs as a single Vercel Python function (all /api/* routes are rewritten here)
and locally with:  uvicorn api.index:app --reload
"""
from __future__ import annotations

import math
import os
import sys
import time
from typing import Literal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field, field_validator  # noqa: E402

from engine import get_model  # noqa: E402
from feed import stream  # noqa: E402
from reasons import build_reasons  # noqa: E402

VERSION = "1.0.0"
Category = Literal["grocery", "fuel", "restaurants", "fashion", "electronics", "travel",
                   "online_services", "jewelry", "gaming_crypto"]
Channel = Literal["chip_in_store", "contactless", "online", "atm"]

app = FastAPI(
    title="FraudLens API",
    version=VERSION,
    description=(
        "Real-time card fraud detection. Send a transaction, get a risk score, "
        "a block / review / approve decision and the reasons behind it.\n\n"
        "Model: gradient-boosted trees (LightGBM) trained on 400k transactions with "
        "0.4% fraud, decision threshold tuned to maximise money saved."
    ),
    docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Transaction(BaseModel):
    """One card payment."""
    id: str | None = Field(None, max_length=64, description="Your own reference")
    amount: float = Field(..., gt=0, le=100_000, description="Payment amount in USD", examples=[1840])
    customer_avg_amount: float = Field(..., gt=0, le=100_000, description="Customer's usual payment size", examples=[62])
    hour: int = Field(..., ge=0, le=23, description="Local hour of the payment (0-23)", examples=[3])
    merchant_category: Category = Field(..., examples=["electronics"])
    channel: Channel = Field(..., examples=["online"])
    distance_km: float = Field(0, ge=0, le=20_000, description="Distance from the cardholder's home")
    country_mismatch: bool = Field(False, description="Payment country differs from card country")
    new_device: bool = Field(False, description="Device never seen on this account")
    txn_count_24h: int = Field(1, ge=1, le=1000, description="Payments on this card in the last 24 hours")
    account_age_days: int = Field(365, ge=0, le=30_000)
    failed_attempts_1h: int = Field(0, ge=0, le=100, description="Wrong PIN/CVV attempts in the last hour")

    model_config = {"json_schema_extra": {"examples": [{
        "amount": 1840, "customer_avg_amount": 62, "hour": 3, "merchant_category": "electronics",
        "channel": "online", "distance_km": 12, "country_mismatch": False, "new_device": True,
        "txn_count_24h": 4, "account_age_days": 900, "failed_attempts_1h": 3}]}}

    @field_validator("amount", "customer_avg_amount", "distance_km")
    @classmethod
    def finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("must be a finite number")
        return v


class Reason(BaseModel):
    feature: str
    title: str
    detail: str
    icon: str
    direction: Literal["raises", "lowers"]
    impact: float
    share: float


class Prediction(BaseModel):
    id: str | None
    risk_score: int = Field(..., description="0-100. 50 and above is blocked")
    probability: float = Field(..., description="Calibrated fraud probability")
    decision: Literal["approve", "review", "block"]
    threshold: float
    reasons: list[Reason]
    latency_ms: float


class BatchIn(BaseModel):
    transactions: list[Transaction] = Field(..., min_length=1, max_length=5000)


def _vector(t: Transaction, m) -> list[float]:
    return [t.amount, t.hour, m.categories.index(t.merchant_category), m.channels.index(t.channel),
            t.distance_km, int(t.country_mismatch), int(t.new_device), t.txn_count_24h,
            t.amount / t.customer_avg_amount, t.account_age_days, t.failed_attempts_1h]


def risk_score(p: float, threshold: float) -> int:
    """Map probability to a 0-100 score where the business threshold sits at 50."""
    p = min(max(p, 1e-6), 1 - 1e-6)
    z = (math.log(p / (1 - p)) - math.log(threshold / (1 - threshold))) * 1.15
    return int(round(100 / (1 + math.exp(-z))))


def score(t: Transaction, explain: bool = True) -> dict:
    m = get_model()
    start = time.perf_counter()
    x = _vector(t, m)
    p, contrib = m.score(x)
    s = risk_score(p, m.threshold)
    decision = "block" if s >= 50 else "review" if s >= 35 else "approve"
    reasons = build_reasons(m.features, x, contrib, t.model_dump()) if explain else []
    return dict(id=t.id, risk_score=s, probability=round(p, 5), decision=decision,
                threshold=m.threshold, reasons=reasons,
                latency_ms=round((time.perf_counter() - start) * 1000, 3))


@app.get("/api/health", tags=["system"])
def health():
    m = get_model()
    return {"status": "ok", "version": VERSION, "model": "lightgbm", "trees": len(m.trees)}


@app.post("/api/predict", response_model=Prediction, tags=["scoring"],
          summary="Score one transaction")
def predict(t: Transaction):
    return score(t)


@app.post("/api/predict/batch", tags=["scoring"], summary="Score up to 5,000 transactions")
def predict_batch(body: BatchIn, explain: bool = Query(True, description="Include top reasons")):
    start = time.perf_counter()
    results = [score(t, explain) for t in body.transactions]
    blocked = [r for r, t in zip(results, body.transactions) if r["decision"] == "block"]
    amount_blocked = sum(t.amount for r, t in zip(results, body.transactions) if r["decision"] == "block")
    return {
        "count": len(results), "blocked": len(blocked),
        "review": sum(r["decision"] == "review" for r in results),
        "amount_blocked": round(amount_blocked, 2),
        "total_ms": round((time.perf_counter() - start) * 1000, 2),
        "results": results,
    }


@app.get("/api/feed", tags=["demo"], summary="Synthetic live stream, scored")
def feed(n: int = Query(6, ge=1, le=50), seed: int | None = None):
    items = []
    for raw in stream(n, seed=seed):
        meta = {k: raw.pop(k) for k in ("merchant", "city", "card_last4")}
        t = Transaction(**raw)
        r = score(t)
        items.append({**t.model_dump(), **meta, **r, "reasons": r["reasons"][:2]})
    return {"items": items, "note": "Fraud share boosted to ~12% for the demo (real world ~0.4%)."}


@app.get("/api/model", tags=["model"], summary="Model card, curves and threshold table")
def model_info():
    m = get_model()
    return {"features": m.features, "categories": m.categories, "channels": m.channels,
            "metrics": m.metrics}
