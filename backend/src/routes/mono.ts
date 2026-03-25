import { Router } from "express";
import {
  exchangeMonoCode,
  getMonoAccountBalance,
  listMonoTransactions,
} from "../integrations/mono.js";

export const monoRouter = Router();

/** Layer 1 — Mono: exchange OAuth-style code for account id (stub flow). */
monoRouter.post("/mono/token", async (req, res) => {
  const code = String(req.body?.code ?? "");
  if (!code) {
    res.status(400).json({ error: "code_required" });
    return;
  }
  try {
    const result = await exchangeMonoCode(code);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "mono_error";
    res.status(502).json({ error: message });
  }
});

monoRouter.get("/mono/accounts/:accountId/balance", async (req, res) => {
  try {
    const data = await getMonoAccountBalance(req.params.accountId);
    res.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "mono_error";
    res.status(502).json({ error: message });
  }
});

monoRouter.get("/mono/accounts/:accountId/transactions", async (req, res) => {
  try {
    const data = await listMonoTransactions(req.params.accountId);
    res.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "mono_error";
    res.status(502).json({ error: message });
  }
});
