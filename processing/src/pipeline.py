"""
Layer 2 — Clean & enrich transaction rows (Pandas) before persistence.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import pandas as pd


def _txn_id(account_id: str, row: dict[str, Any]) -> str:
    base = f"{account_id}|{row.get('amount')}|{row.get('narration')}|{row.get('date')}"
    return hashlib.sha256(base.encode()).hexdigest()[:32]


def _guess_category(narration: str | None) -> str | None:
    if not narration:
        return None
    n = narration.lower()
    if any(x in n for x in ("uber", "bolt", "fuel", "petrol")):
        return "transport"
    if any(x in n for x in ("rent", "landlord")):
        return "housing"
    if any(x in n for x in ("transfer", "salary", "credit")):
        return "income"
    if any(x in n for x in ("food", "restaurant", "market")):
        return "food"
    return "other"


def normalize_transactions(account_id: str, rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["id", "account_id", "amount", "narration", "category", "raw_json"]
        )

    df = pd.DataFrame(rows)
    df["account_id"] = account_id
    if "amount" not in df.columns:
        df["amount"] = 0.0
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    if "narration" not in df.columns:
        df["narration"] = ""
    df["narration"] = df["narration"].astype(str)
    df["category"] = df["narration"].apply(_guess_category)

    records = df.to_dict(orient="records")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in records:
        rid = _txn_id(account_id, r)
        if rid in seen:
            continue
        seen.add(rid)
        out.append(
            {
                "id": rid,
                "account_id": account_id,
                "amount": float(r["amount"]),
                "narration": r["narration"],
                "category": r["category"],
                "raw_json": json.dumps(r, default=str),
            }
        )

    return pd.DataFrame(out)


def monthly_income_spend(df: pd.DataFrame) -> dict[str, float]:
    if df.empty:
        return {"income": 0.0, "spend": 0.0}

    income = float(df.loc[df["amount"] > 0, "amount"].sum())
    spend = float(-df.loc[df["amount"] < 0, "amount"].sum())
    return {"income": income, "spend": spend}
