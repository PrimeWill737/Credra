import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { query } from "../db.js";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8001";

export const scoreRouter = Router();

function getBearerToken(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

async function requireActiveClientApiKey(req: Request, res: Response): Promise<{
  apiKeyId: number;
  accountId: number;
} | null> {
  const apiKey = getBearerToken(req);
  if (!apiKey) {
    res.status(401).json({ error: "api_key_required" });
    return null;
  }

  const apiKeyHash = sha256Hex(apiKey);

  const keyRes = await query<{
    id: number;
    account_id: number;
    status: string;
  }>(
    `SELECT id, account_id, status
     FROM client_api_keys
     WHERE api_key_hash = $1
     LIMIT 1`,
    [apiKeyHash],
  );

  if (!keyRes.rowCount) {
    res.status(401).json({ error: "invalid_api_key" });
    return null;
  }

  if (keyRes.rows[0].status !== "active") {
    res.status(403).json({ error: "api_key_not_active" });
    return null;
  }

  const subRes = await query<{
    status: string;
  }>(
    `SELECT status
     FROM client_subscriptions
     WHERE account_id = $1
     ORDER BY approved_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [keyRes.rows[0].account_id],
  );

  if (!subRes.rowCount || subRes.rows[0].status !== "active") {
    res.status(403).json({ error: "subscription_not_active" });
    return null;
  }

  return { apiKeyId: keyRes.rows[0].id, accountId: keyRes.rows[0].account_id };
}

scoreRouter.post("/credit-score", async (req, res) => {
  try {
    const ok = await requireActiveClientApiKey(req, res);
    if (!ok) return;

    const r = await fetch(`${AI_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(503).json({ error: "ai_unavailable" });
  }
});

scoreRouter.post("/fraud-check", async (req, res) => {
  try {
    const ok = await requireActiveClientApiKey(req, res);
    if (!ok) return;

    const r = await fetch(`${AI_URL}/fraud-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(503).json({ error: "ai_unavailable" });
  }
});

scoreRouter.post("/risk-analysis", async (req, res) => {
  try {
    const ok = await requireActiveClientApiKey(req, res);
    if (!ok) return;

    const r = await fetch(`${AI_URL}/risk-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(503).json({ error: "ai_unavailable" });
  }
});
