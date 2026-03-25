"""
Layer 2 — Python + PostgreSQL: ingest, dedupe, categorize, persist.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from .db import SessionLocal, TransactionRow, init_db
from .pipeline import monthly_income_spend, normalize_transactions

log = logging.getLogger("credra.processing")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_ready = False
    try:
        init_db()
        app.state.db_ready = True
        log.info("PostgreSQL OK; tables ready.")
    except Exception as e:  # noqa: BLE001
        log.warning(
            "PostgreSQL unavailable (%s). "
            "From repo root run: docker compose up -d postgres "
            "and ensure DATABASE_URL uses 127.0.0.1:5433 (see processing/.env.example).",
            e,
        )
    yield


app = FastAPI(title="CREDRA Processing", version="0.1.0", lifespan=lifespan)


def _require_db(request: Request) -> None:
    if not getattr(request.app.state, "db_ready", False):
        raise HTTPException(
            status_code=503,
            detail=(
                "Database unavailable. Start Postgres: `docker compose up -d postgres` "
                "from the repo root, then set DATABASE_URL to "
                "postgresql://credra:credra@127.0.0.1:5433/credra in processing/.env"
            ),
        )


class IngestBody(BaseModel):
    account_id: str = Field(..., min_length=1)
    transactions: list[dict] = Field(default_factory=list)


@app.get("/health")
def health(request: Request) -> dict:
    return {
        "ok": True,
        "layer": "processing",
        "db": getattr(request.app.state, "db_ready", False),
    }


@app.post("/ingest")
def ingest(body: IngestBody, request: Request) -> dict:
    _require_db(request)
    df = normalize_transactions(body.account_id, body.transactions)
    stats = monthly_income_spend(df)

    if df.empty:
        return {"stored": 0, "stats": stats}

    session = SessionLocal()
    try:
        stored = 0
        for _, row in df.iterrows():
            existing = session.get(TransactionRow, row["id"])
            if existing:
                continue
            session.add(
                TransactionRow(
                    id=row["id"],
                    account_id=row["account_id"],
                    amount=row["amount"],
                    narration=row["narration"],
                    category=row["category"],
                    raw_json=row["raw_json"],
                )
            )
            stored += 1
        session.commit()
        return {"stored": stored, "stats": stats}
    except Exception as e:  # noqa: BLE001
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        session.close()


@app.get("/accounts/{account_id}/summary")
def summary(account_id: str, request: Request) -> dict:
    _require_db(request)
    session = SessionLocal()
    try:
        stmt = select(TransactionRow).where(TransactionRow.account_id == account_id)
        rows = list(session.scalars(stmt).all())
        income = sum(r.amount for r in rows if r.amount > 0)
        spend = sum(-r.amount for r in rows if r.amount < 0)
        return {
            "account_id": account_id,
            "income": float(income),
            "spend": float(spend),
            "tx_count": len(rows),
        }
    finally:
        session.close()
