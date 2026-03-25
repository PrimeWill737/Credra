import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Resend } from "resend";
import { query } from "../db.js";
import {
  signClientAccessToken,
  signPendingEmailToken,
  verifyClientAccessToken,
  verifyPendingEmailToken,
} from "../lib/clientTokens.js";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8001";

// For now, subscriptions are verified via bank transfer (manual admin approval).
// These are the receiving details to show to the client.
const RECEIVING_BANK_NAME = process.env.BILLING_RECEIVING_BANK_NAME ?? "GTBank";
const RECEIVING_ACCOUNT_NUMBER = process.env.BILLING_RECEIVING_ACCOUNT_NUMBER ?? "0558518751";
const RECEIVING_ACCOUNT_NAME = process.env.BILLING_RECEIVING_ACCOUNT_NAME ?? "Onoja William Bosworth";

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() ?? "";
const RESEND_FROM = process.env.RESEND_FROM?.trim() || "CREDRA <onboarding@credra.local>";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const clientRouter = Router();

type ClientAuthedRequest = Request & {
  clientEmail?: string;
};

function getBearerToken(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function generateOtp(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

async function sendOtpEmail(to: string, otp: string) {
  const subject = "Your CREDRA verification code";
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.5;">
      <h2 style="margin:0 0 12px;">Verify your email</h2>
      <p style="margin:0 0 12px;">Use this one-time code to finish creating your CREDRA client account:</p>
      <p style="margin:0 0 18px;font-size:24px;font-weight:800;letter-spacing:0.18em;">${otp}</p>
      <p style="margin:0;color:#6b7280;">This code expires in 10 minutes.</p>
    </div>
  `;

  if (!resend) {
    console.warn("[client/otp] RESEND_API_KEY not set; OTP for %s is %s", to, otp);
    return;
  }

  await resend.emails.send({
    from: RESEND_FROM,
    to,
    subject,
    html,
  });
}

function clientAuth(req: ClientAuthedRequest, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const payload = verifyClientAccessToken(token);
  if (!payload) return res.status(401).json({ error: "unauthorized" });

  req.clientEmail = payload.sub;
  return next();
}

async function requireActiveApiKey(req: Request, res: Response) {
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
    id: number;
    status: string;
  }>(
    `SELECT id, status
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

clientRouter.post("/auth/signup", async (req, res) => {
  const { companyName, contactEmail, password, fullName } = req.body ?? {};

  if (!companyName || !contactEmail || !password) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  const email = normalizeEmail(contactEmail);
  const company = String(companyName).trim();
  const displayName = fullName ? String(fullName).trim() : company;

  try {
    const existing = await query<{ email: string }>(
      `SELECT email FROM client_users WHERE email = $1`,
      [email],
    );
    if (existing.rowCount) {
      return res.status(409).json({ error: "email_already_registered" });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);

    await query(
      `INSERT INTO client_users (email, password_hash, full_name, email_verified)
       VALUES ($1, $2, $3, FALSE)`,
      [email, passwordHash, displayName],
    );

    const createdAccount = await query<{
      id: number;
      company_name: string;
      contact_email: string;
      status: string;
    }>(
      `INSERT INTO client_accounts (company_name, contact_email)
       VALUES ($1, $2)
       RETURNING id, company_name, contact_email, status`,
      [company, email],
    );

    const otp = generateOtp();
    const otpHash = sha256Hex(`${email}:${otp}`);
    await query(
      `INSERT INTO client_email_otps (email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, 'signup', NOW() + INTERVAL '10 minutes')`,
      [email, otpHash],
    );

    await sendOtpEmail(email, otp);

    const pendingToken = signPendingEmailToken(email);

    return res.status(201).json({
      requiresOtp: true,
      pendingToken,
      account: createdAccount.rows[0],
      message: "OTP sent. Verify to complete signup.",
    });
  } catch (err) {
    console.error("[client/signup] error", err);
    return res.status(500).json({ error: "signup_failed" });
  }
});

clientRouter.post("/auth/otp/resend", async (req, res) => {
  const { pendingToken } = req.body ?? {};
  if (!pendingToken) return res.status(400).json({ error: "pending_token_required" });

  const pending = verifyPendingEmailToken(String(pendingToken));
  if (!pending) return res.status(401).json({ error: "invalid_pending_token" });

  const email = normalizeEmail(pending.sub);

  const userRes = await query<{ email_verified: boolean }>(
    `SELECT email_verified FROM client_users WHERE email = $1`,
    [email],
  );
  if (!userRes.rowCount) return res.status(404).json({ error: "not_found" });
  if (userRes.rows[0].email_verified) return res.status(400).json({ error: "already_verified" });

  const otp = generateOtp();
  const otpHash = sha256Hex(`${email}:${otp}`);
  await query(
    `INSERT INTO client_email_otps (email, otp_hash, purpose, expires_at)
     VALUES ($1, $2, 'signup', NOW() + INTERVAL '10 minutes')`,
    [email, otpHash],
  );

  await sendOtpEmail(email, otp);
  return res.json({ ok: true });
});

clientRouter.post("/auth/otp/verify", async (req, res) => {
  const { pendingToken, otp } = req.body ?? {};
  if (!pendingToken || !otp) {
    return res.status(400).json({ error: "pending_token_and_otp_required" });
  }

  const pending = verifyPendingEmailToken(String(pendingToken));
  if (!pending) return res.status(401).json({ error: "invalid_pending_token" });

  const email = normalizeEmail(pending.sub);
  const code = String(otp).replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "otp_invalid" });

  const otpHash = sha256Hex(`${email}:${code}`);
  const otpRes = await query<{ id: number; expires_at: Date; consumed_at: Date | null }>(
    `SELECT id, expires_at, consumed_at
     FROM client_email_otps
     WHERE email = $1 AND otp_hash = $2 AND purpose = 'signup'
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, otpHash],
  );
  if (!otpRes.rowCount) return res.status(401).json({ error: "otp_invalid" });

  const row = otpRes.rows[0];
  if (row.consumed_at) return res.status(400).json({ error: "otp_consumed" });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(401).json({ error: "otp_expired" });

  await query(`UPDATE client_email_otps SET consumed_at = NOW() WHERE id = $1`, [row.id]);
  await query(`UPDATE client_users SET email_verified = TRUE WHERE email = $1`, [email]);
  await query(`UPDATE client_accounts SET status = 'awaiting_payment' WHERE contact_email = $1`, [email]);

  // Issue API key now (only hash is stored in DB).
  const apiKey = crypto.randomBytes(32).toString("hex");
  const apiKeyHash2 = sha256Hex(apiKey);

  const accountRes = await query<{ id: number; company_name: string; status: string; plan_name: string; cycle: string }>(
    `SELECT id, company_name, status, plan_name, cycle
     FROM client_accounts
     WHERE contact_email = $1
     LIMIT 1`,
    [email],
  );
  const account = accountRes.rows[0] ?? null;

  if (account) {
    await query(
      `INSERT INTO client_api_keys (account_id, key_name, api_key_hash, status)
       VALUES ($1, $2, $3, 'pending')`,
      [account.id, "Production Key", apiKeyHash2],
    );
  }

  const token = signClientAccessToken(email);
  return res.json({
    token,
    apiKey,
    account,
    billing: {
      bank: RECEIVING_BANK_NAME,
      accountNumber: RECEIVING_ACCOUNT_NUMBER,
      accountName: RECEIVING_ACCOUNT_NAME,
    },
  });
});

clientRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email_and_password_required" });

  const e = normalizeEmail(email);
  try {
    const userRes = await query<{
      email: string;
      password_hash: string;
      full_name: string;
      email_verified: boolean;
    }>(
      `SELECT email, password_hash, full_name, email_verified FROM client_users WHERE email = $1`,
      [e],
    );
    if (!userRes.rowCount) return res.status(401).json({ error: "invalid_credentials" });
    if (!userRes.rows[0].email_verified) {
      return res.status(403).json({ error: "email_not_verified" });
    }

    const ok = await bcrypt.compare(String(password), userRes.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = signClientAccessToken(userRes.rows[0].email);

    const accountRes = await query<{
      id: number;
      company_name: string;
      status: string;
      plan_name: string;
      cycle: string;
    }>(
      `SELECT id, company_name, status, plan_name, cycle
       FROM client_accounts
       WHERE contact_email = $1`,
      [e],
    );

    const account = accountRes.rows[0] ?? null;
    return res.json({
      token,
      account,
    });
  } catch (err) {
    console.error("[client/login] error", err);
    return res.status(500).json({ error: "login_failed" });
  }
});

clientRouter.get("/me", clientAuth, async (req: ClientAuthedRequest, res: Response) => {
  const email = req.clientEmail;
  if (!email) return res.status(401).json({ error: "unauthorized" });

  const [account, subscription, latestTransfer] = await Promise.all([
    query<{
      id: number;
      company_name: string;
      status: string;
      plan_name: string;
      cycle: string;
      created_at: Date;
    }>(
      `SELECT id, company_name, status, plan_name, cycle, created_at
       FROM client_accounts
       WHERE contact_email = $1
       LIMIT 1`,
      [email],
    ),
    query<{
      id: number;
      plan_name: string;
      cycle: string;
      amount_due: string;
      status: string;
      started_at: Date;
      approved_at: Date | null;
    }>(
      `SELECT id, plan_name, cycle, amount_due::text, status, started_at, approved_at
       FROM client_subscriptions
       WHERE account_id = (SELECT id FROM client_accounts WHERE contact_email = $1)
       ORDER BY approved_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [email],
    ),
    query<{
      id: number;
      transaction_reference: string;
      amount: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, transaction_reference, amount::text, status, created_at
       FROM client_transfers
       WHERE subscription_id = (SELECT id FROM client_subscriptions WHERE account_id = (SELECT id FROM client_accounts WHERE contact_email = $1)
                                 ORDER BY approved_at DESC NULLS LAST, created_at DESC
                                 LIMIT 1)
       ORDER BY created_at DESC
       LIMIT 1`,
      [email],
    ),
  ]);

  const acc = account.rows[0] ?? null;
  const sub = subscription.rows[0] ?? null;
  const transfer = latestTransfer.rows[0] ?? null;

  return res.json({
    account: acc,
    subscription: sub,
    latestTransfer: transfer,
    billing: {
      bank: RECEIVING_BANK_NAME,
      accountNumber: RECEIVING_ACCOUNT_NUMBER,
      accountName: RECEIVING_ACCOUNT_NAME,
    },
  });
});

clientRouter.post("/subscription/transfer", clientAuth, async (req: ClientAuthedRequest, res: Response) => {
  const email = req.clientEmail;
  if (!email) return res.status(401).json({ error: "unauthorized" });

  const { planName, cycle, amountDue, payerName, transactionReference } = req.body ?? {};

  if (!planName || !cycle || !amountDue || !payerName || !transactionReference) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  const accountRes = await query<{ id: number }>(
    `SELECT id FROM client_accounts WHERE contact_email = $1 LIMIT 1`,
    [email],
  );
  if (!accountRes.rowCount) return res.status(404).json({ error: "account_not_found" });

  const accountId = accountRes.rows[0].id;

  // Prevent multiple simultaneous active/pending admin transfers.
  const existing = await query<{ status: string }>(
    `SELECT status FROM client_subscriptions
     WHERE account_id = $1
     ORDER BY approved_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [accountId],
  );

  if (existing.rowCount && ["active", "pending_transfer"].includes(existing.rows[0].status)) {
    return res.status(409).json({ error: "subscription_already_in_progress" });
  }

  try {
    const amount = Number(amountDue);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount_due_invalid" });
    }

    const subscriptionRes = await query<{
      id: number;
    }>(
      `INSERT INTO client_subscriptions (account_id, plan_name, cycle, amount_due, status)
       VALUES ($1, $2, $3, $4, 'pending_transfer')
       RETURNING id`,
      [accountId, String(planName), String(cycle), amount],
    );

    const transferRes = await query<{
      id: number;
    }>(
      `INSERT INTO client_transfers (
        subscription_id,
        payer_name,
        receiving_bank_name,
        receiving_account_number,
        receiving_account_name,
        transaction_reference,
        amount,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_admin')
      RETURNING id`,
      [
        subscriptionRes.rows[0].id,
        String(payerName),
        RECEIVING_BANK_NAME,
        RECEIVING_ACCOUNT_NUMBER,
        RECEIVING_ACCOUNT_NAME,
        String(transactionReference),
        amount,
      ],
    );

    await query(
      `UPDATE client_accounts
       SET status = 'awaiting_admin_approval', plan_name = $1, cycle = $2
       WHERE id = $3`,
      [String(planName), String(cycle), accountId],
    );

    return res.status(201).json({
      subscriptionId: subscriptionRes.rows[0].id,
      transferId: transferRes.rows[0].id,
      status: "pending_admin",
    });
  } catch (err) {
    // Most common: transaction_reference unique conflict.
    console.error("[client/subscription/transfer] error", err);
    return res.status(500).json({ error: "transfer_request_failed" });
  }
});

async function proxyAi(req: Request, res: Response, endpoint: string) {
  const result = await requireActiveApiKey(req, res);
  if (!result) return;

  const started = Date.now();
  try {
    const r = await fetch(`${AI_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });

    const data = await r.json().catch(() => ({}));
    const ms = Date.now() - started;

    await query(
      `INSERT INTO client_usage_logs (api_key_id, endpoint, status_code, ok, response_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [result.apiKeyId, endpoint, r.status, r.ok, ms],
    );

    return res.status(r.status).json(data);
  } catch (err) {
    const ms = Date.now() - started;
    await query(
      `INSERT INTO client_usage_logs (api_key_id, endpoint, status_code, ok, response_ms)
       VALUES ($1, $2, 503, false, $3)`,
      [result.apiKeyId, endpoint, ms],
    );
    return res.status(503).json({ error: "ai_unavailable" });
  }
}

clientRouter.post("/credit-score", (req, res) => proxyAi(req, res, "score"));
clientRouter.post("/fraud-check", (req, res) => proxyAi(req, res, "fraud-check"));
clientRouter.post("/risk-analysis", (req, res) => proxyAi(req, res, "risk-analysis"));

