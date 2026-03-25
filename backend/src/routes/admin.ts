import PDFDocument from "pdfkit";
import bcrypt from "bcrypt";
import { Router, type Request, type Response, type NextFunction } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import { query } from "../db.js";
import {
  signAccessToken,
  signPending2faToken,
  verifyAccessToken,
  verifyPending2faToken,
} from "../lib/adminTokens.js";

type AdminAuthedRequest = Request & { adminEmail?: string; adminRole?: string };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = "credra_admin_access";

export const adminRouter = Router();

function unauthorized(res: Response) {
  return res.status(401).json({ error: "unauthorized" });
}

function getBearerToken(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.cookies?.[COOKIE_NAME];
  return typeof cookie === "string" ? cookie : "";
}

function setAccessCookie(res: Response, token: string) {
  const secure = process.env.ADMIN_COOKIE_SECURE === "true";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

function clearAccessCookie(res: Response) {
  const secure = process.env.ADMIN_COOKIE_SECURE === "true";
  res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, secure, sameSite: "lax" });
}

async function adminAuth(
  req: AdminAuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);
  if (!token) {
    return unauthorized(res);
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return unauthorized(res);
  }

  req.adminEmail = payload.sub;
  req.adminRole = payload.role;
  return next();
}

adminRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: "email_and_password_required" });
  }

  try {
    const userRes = await query<{
      email: string;
      password_hash: string;
      role: string;
      full_name: string;
      totp_enabled: boolean;
      totp_secret: string | null;
    }>(
      `SELECT email, password_hash, role, full_name, totp_enabled, totp_secret
       FROM admin_users
       WHERE email = $1`,
      [email],
    );

    if (!userRes.rowCount) {
      await query(
        `INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
         VALUES ($1, $2, $3, $4)`,
        ["login_failed", email, req.ip, JSON.stringify({ source: "admin_login" })],
      );
      return unauthorized(res);
    }

    const row = userRes.rows[0];
    const passwordOk = await bcrypt.compare(password, row.password_hash);

    await query(
      `INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
       VALUES ($1, $2, $3, $4)`,
      [
        passwordOk ? "login_password_ok" : "login_failed",
        email,
        req.ip,
        JSON.stringify({ source: "admin_login" }),
      ],
    );

    if (!passwordOk) {
      return unauthorized(res);
    }

    if (row.totp_enabled && row.totp_secret) {
      const pendingToken = signPending2faToken(email);
      return res.json({
        requiresTotp: true,
        pendingToken,
        admin: {
          email: row.email,
          name: row.full_name,
          role: row.role,
        },
      });
    }

    const accessToken = signAccessToken(row.email, row.role);
    setAccessCookie(res, accessToken);

    await query(
      `INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
       VALUES ($1, $2, $3, $4)`,
      [
        "login_success",
        email,
        req.ip,
        JSON.stringify({ source: "admin_login", method: "password" }),
      ],
    );

    return res.json({
      requiresTotp: false,
      token: accessToken,
      admin: {
        email: row.email,
        name: row.full_name,
        role: row.role,
      },
      expiresInHours: 12,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "";
    console.error("[admin/login] database error:", err);
    if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
      return res.status(503).json({
        error: "database_unavailable",
        message:
          "Cannot connect to PostgreSQL. Set DATABASE_URL in backend/.env to your database (same URI as processing/.env for Supabase). For local Docker, run: docker compose up -d postgres",
      });
    }
    if (code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      return res.status(503).json({
        error: "database_ssl",
        message:
          "TLS certificate verification failed. The backend defaults to relaxed SSL for remote DBs; if you set DATABASE_SSL_REJECT_UNAUTHORIZED=true, remove it or fix your Node CA store.",
      });
    }
    return res.status(503).json({
      error: "database_error",
      message: "Database error during login. Check backend logs and DATABASE_URL.",
    });
  }
});

adminRouter.post("/auth/totp/verify", async (req, res) => {
  const { pendingToken, code } = req.body ?? {};
  if (!pendingToken || !code) {
    return res.status(400).json({ error: "pending_token_and_code_required" });
  }

  const pending = verifyPending2faToken(pendingToken);
  if (!pending) {
    return res.status(401).json({ error: "invalid_pending_token" });
  }

  const userRes = await query<{
    email: string;
    role: string;
    full_name: string;
    totp_secret: string | null;
    totp_enabled: boolean;
  }>(
    `SELECT email, role, full_name, totp_secret, totp_enabled
     FROM admin_users
     WHERE email = $1`,
    [pending.sub],
  );

  if (!userRes.rowCount || !userRes.rows[0].totp_enabled || !userRes.rows[0].totp_secret) {
    return res.status(400).json({ error: "totp_not_configured" });
  }

  const ok = verifySync({
    token: String(code).replace(/\s/g, ""),
    secret: userRes.rows[0].totp_secret,
  }).valid;

  if (!ok) {
    await query(
      `INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
       VALUES ($1, $2, $3, $4)`,
      [
        "totp_failed",
        pending.sub,
        req.ip,
        JSON.stringify({ source: "admin_totp" }),
      ],
    );
    return res.status(401).json({ error: "invalid_totp_code" });
  }

  const row = userRes.rows[0];
  const accessToken = signAccessToken(row.email, row.role);
  setAccessCookie(res, accessToken);

  await query(
    `INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
     VALUES ($1, $2, $3, $4)`,
    [
      "login_success",
      row.email,
      req.ip,
      JSON.stringify({ source: "admin_login", method: "totp" }),
    ],
  );

  return res.json({
    requiresTotp: false,
    token: accessToken,
    admin: {
      email: row.email,
      name: row.full_name,
      role: row.role,
    },
    expiresInHours: 12,
  });
});

adminRouter.post("/auth/logout", (_req, res) => {
  clearAccessCookie(res);
  return res.status(204).send();
});

adminRouter.post("/auth/totp/setup", adminAuth, async (req: AdminAuthedRequest, res) => {
  const email = req.adminEmail;
  if (!email) return unauthorized(res);

  const userRes = await query<{ totp_enabled: boolean }>(
    `SELECT totp_enabled FROM admin_users WHERE email = $1`,
    [email],
  );
  if (!userRes.rowCount) {
    return res.status(404).json({ error: "not_found" });
  }
  if (userRes.rows[0].totp_enabled) {
    return res.status(400).json({ error: "totp_already_enabled" });
  }

  const secret = generateSecret();
  await query(`UPDATE admin_users SET totp_secret = $1 WHERE email = $2`, [secret, email]);

  const otpauthUrl = generateURI({
    issuer: "CREDRA Admin",
    label: email,
    secret,
  });

  await query(
    `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
     VALUES ($1, $2, $3, $4)`,
    [email, "totp_setup_started", "admin_user", email],
  );

  return res.json({
    secret,
    otpauthUrl,
    message: "Scan the QR or enter the secret, then POST /auth/totp/enable with a valid code.",
  });
});

adminRouter.post("/auth/totp/enable", adminAuth, async (req: AdminAuthedRequest, res) => {
  const email = req.adminEmail;
  const { code } = req.body ?? {};
  if (!email || !code) {
    return res.status(400).json({ error: "code_required" });
  }

  const userRes = await query<{ totp_secret: string | null; totp_enabled: boolean }>(
    `SELECT totp_secret, totp_enabled FROM admin_users WHERE email = $1`,
    [email],
  );
  if (!userRes.rowCount || !userRes.rows[0].totp_secret) {
    return res.status(400).json({ error: "totp_not_setup" });
  }
  if (userRes.rows[0].totp_enabled) {
    return res.status(400).json({ error: "totp_already_enabled" });
  }

  const ok = verifySync({
    token: String(code).replace(/\s/g, ""),
    secret: userRes.rows[0].totp_secret,
  }).valid;
  if (!ok) {
    return res.status(401).json({ error: "invalid_totp_code" });
  }

  await query(`UPDATE admin_users SET totp_enabled = TRUE WHERE email = $1`, [email]);
  await query(
    `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
     VALUES ($1, $2, $3, $4)`,
    [email, "totp_enabled", "admin_user", email],
  );

  return res.json({ ok: true, totpEnabled: true });
});

adminRouter.use(adminAuth);

adminRouter.get("/panel", async (_req, res) => {
  const [
    dashboard,
    users,
    usageByUser,
    integrations,
    ingestion,
    models,
    predictions,
    apiKeys,
    riskItems,
    subscriptions,
    settings,
    securityEvents,
    usageDaily,
    auditLogs,
  ] = await Promise.all([
    query(`SELECT * FROM admin_dashboard_snapshot ORDER BY created_at DESC LIMIT 1`),
    query(
      `SELECT id, company_name, contact_email, role, status, api_calls_month, avg_risk_score
       FROM admin_clients ORDER BY created_at DESC`,
    ),
    query(
      `SELECT company_name, api_calls_month, avg_risk_score
       FROM admin_clients ORDER BY api_calls_month DESC`,
    ),
    query(
      `SELECT provider, status, connected_accounts, last_sync_at
       FROM admin_integrations ORDER BY provider`,
    ),
    query(
      `SELECT id, pipeline_name, status, records_ingested, created_at
       FROM admin_ingestion_runs ORDER BY created_at DESC LIMIT 10`,
    ),
    query(
      `SELECT model_name, version, previous_version, accuracy, precision_score, recall_score, updated_at
       FROM admin_model_metrics ORDER BY updated_at DESC`,
    ),
    query(
      `SELECT id, applicant_ref, prediction_type, score, flagged_reason, created_at
       FROM admin_predictions ORDER BY created_at DESC LIMIT 12`,
    ),
    query(
      `SELECT id, key_name, status, calls_24h, error_rate_pct, rate_limit_per_min
       FROM admin_api_keys ORDER BY created_at DESC`,
    ),
    query(
      `SELECT id, item_type, applicant_ref, risk_level, status, created_at
       FROM admin_risk_reviews ORDER BY created_at DESC`,
    ),
    query(
      `SELECT id, company_name, plan_name, cycle, status, amount_due, next_invoice_date
       FROM admin_subscriptions ORDER BY company_name`,
    ),
    query(`SELECT key, value FROM admin_settings ORDER BY key`),
    query(
      `SELECT id, event_type, admin_email, ip_address, created_at
       FROM admin_security_events ORDER BY created_at DESC LIMIT 20`,
    ),
    query(
      `SELECT day, api_calls, error_count, revenue
       FROM admin_usage_daily ORDER BY day DESC LIMIT 14`,
    ),
    query(
      `SELECT id, admin_email, action, target_type, target_id, created_at
       FROM admin_audit_logs ORDER BY created_at DESC LIMIT 25`,
    ),
  ]);

  return res.json({
    dashboard: dashboard.rows[0] ?? null,
    userManagement: {
      clients: users.rows,
      usageByUser: usageByUser.rows,
    },
    dataManagement: {
      integrations: integrations.rows,
      ingestionRuns: ingestion.rows,
      auditTrails: auditLogs.rows,
    },
    aiModelMonitoring: {
      versions: models.rows,
      recentPredictions: predictions.rows,
    },
    apiManagement: {
      keys: apiKeys.rows,
    },
    transactionsRiskReview: {
      flaggedItems: riskItems.rows,
    },
    billingSubscriptions: {
      subscriptions: subscriptions.rows,
    },
    settingsConfiguration: {
      values: settings.rows,
    },
    securityCompliance: {
      events: securityEvents.rows,
    },
    analyticsReporting: {
      usageDaily: usageDaily.rows,
    },
    extras: {
      notificationsEnabled: true,
      exportFormats: ["csv", "pdf", "excel"],
      roleSpecificDashboards: ["admin", "support", "compliance"],
    },
  });
});

adminRouter.get("/exports/compliance.csv", async (_req, res) => {
  const [risk, audit, security] = await Promise.all([
    query(
      `SELECT id, item_type, applicant_ref, risk_level, status, created_at
       FROM admin_risk_reviews ORDER BY created_at DESC LIMIT 500`,
    ),
    query(
      `SELECT id, admin_email, action, target_type, target_id, created_at
       FROM admin_audit_logs ORDER BY created_at DESC LIMIT 500`,
    ),
    query(
      `SELECT id, event_type, admin_email, ip_address, created_at
       FROM admin_security_events ORDER BY created_at DESC LIMIT 500`,
    ),
  ]);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="credra-compliance-export.csv"',
  );

  const lines: string[] = [];
  lines.push("section,id,details");
  for (const r of risk.rows as Record<string, unknown>[]) {
    lines.push(
      `risk_review,${escapeCsv(r.id)},${escapeCsv(JSON.stringify(r))}`,
    );
  }
  for (const r of audit.rows as Record<string, unknown>[]) {
    lines.push(`audit,${escapeCsv(r.id)},${escapeCsv(JSON.stringify(r))}`);
  }
  for (const r of security.rows as Record<string, unknown>[]) {
    lines.push(
      `security,${escapeCsv(r.id)},${escapeCsv(JSON.stringify(r))}`,
    );
  }
  res.send(lines.join("\n"));
});

adminRouter.get("/exports/compliance.pdf", async (_req, res) => {
  const snap = await query(
    `SELECT * FROM admin_dashboard_snapshot ORDER BY created_at DESC LIMIT 1`,
  );
  const riskCount = await query(`SELECT COUNT(*)::int AS c FROM admin_risk_reviews`);
  const auditCount = await query(`SELECT COUNT(*)::int AS c FROM admin_audit_logs`);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="credra-compliance-report.pdf"',
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text("CREDRA — Compliance summary", { underline: true });
  doc.moveDown();
  doc.fontSize(11).text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown(0.5);

  const d = snap.rows[0] as Record<string, unknown> | undefined;
  if (d) {
    doc.text(`Total users / clients: ${String(d.total_users)}`);
    doc.text(`Fraud alerts (snapshot): ${String(d.fraud_alerts)}`);
    doc.text(`System uptime: ${String(d.system_uptime)}`);
    doc.text(`System errors (snapshot): ${String(d.system_errors)}`);
  }
  doc.moveDown();
  doc.text(`Open risk review rows (cap 500 in CSV export): ${String(riskCount.rows[0]?.c ?? 0)}`);
  doc.text(`Audit log rows (cap 500 in CSV export): ${String(auditCount.rows[0]?.c ?? 0)}`);
  doc.moveDown();
  doc.fontSize(10).fillColor("#444").text(
    "This report is generated from admin snapshot and counts. Use the CSV export for regulator-ready row-level extracts.",
    { align: "left" },
  );
  doc.end();
});

function escapeCsv(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

adminRouter.get("/users", async (_req, res) => {
  const users = await query(
    `SELECT id, company_name, contact_email, role, status, api_calls_month, avg_risk_score
     FROM admin_clients ORDER BY created_at DESC`,
  );
  return res.json({ users: users.rows });
});

adminRouter.post("/users", async (req: AdminAuthedRequest, res) => {
  const { companyName, contactEmail, role, status } = req.body ?? {};
  if (!companyName || !contactEmail || !role || !status) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  const created = await query(
    `INSERT INTO admin_clients (company_name, contact_email, role, status, api_calls_month, avg_risk_score)
     VALUES ($1, $2, $3, $4, 0, 0)
     RETURNING id, company_name, contact_email, role, status, api_calls_month, avg_risk_score`,
    [companyName, contactEmail, role, status],
  );

  if (req.adminEmail) {
    await query(
      `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [req.adminEmail, "client_created", "admin_client", String(created.rows[0].id)],
    );
  }

  return res.status(201).json({ user: created.rows[0] });
});

adminRouter.delete("/users/:id", async (req: AdminAuthedRequest, res) => {
  const deleted = await query(
    `DELETE FROM admin_clients WHERE id = $1 RETURNING id`,
    [req.params.id],
  );
  if (!deleted.rowCount) {
    return res.status(404).json({ error: "not_found" });
  }
  if (req.adminEmail) {
    await query(
      `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [req.adminEmail, "client_deleted", "admin_client", req.params.id],
    );
  }
  return res.status(204).send();
});

// === Client subscription approval (transfer -> active) ===
// Paying customers never see admin panel; they submit transfer details to get reviewed here.
adminRouter.post("/client/transfers/:transferId/approve", async (req: AdminAuthedRequest, res: Response) => {
  const transferId = Number(req.params.transferId);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return res.status(400).json({ error: "invalid_transfer_id" });
  }

  const transfer = await query<{ subscription_id: number }>(
    `SELECT subscription_id
     FROM client_transfers
     WHERE id = $1`,
    [transferId],
  );
  if (!transfer.rowCount) return res.status(404).json({ error: "not_found" });

  const subscriptionId = transfer.rows[0].subscription_id;

  const subscriptionAccount = await query<{ account_id: number }>(
    `SELECT account_id FROM client_subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  const accountId = subscriptionAccount.rows[0]?.account_id;
  if (!accountId) return res.status(404).json({ error: "subscription_not_found" });

  await query(`UPDATE client_transfers SET status = 'approved', admin_reviewed_at = NOW() WHERE id = $1`, [
    transferId,
  ]);
  await query(
    `UPDATE client_subscriptions
     SET status = 'active', approved_at = NOW()
     WHERE id = $1`,
    [subscriptionId],
  );
  await query(`UPDATE client_accounts SET status = 'active' WHERE id = $1`, [accountId]);
  await query(`UPDATE client_api_keys SET status = 'active' WHERE account_id = $1`, [accountId]);

  if (req.adminEmail) {
    await query(
      `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [req.adminEmail, "client_transfer_approved", "client_transfer", String(transferId)],
    );
  }

  return res.json({ ok: true });
});

adminRouter.post("/client/transfers/:transferId/reject", async (req: AdminAuthedRequest, res: Response) => {
  const transferId = Number(req.params.transferId);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return res.status(400).json({ error: "invalid_transfer_id" });
  }

  const transfer = await query<{ subscription_id: number }>(
    `SELECT subscription_id
     FROM client_transfers
     WHERE id = $1`,
    [transferId],
  );
  if (!transfer.rowCount) return res.status(404).json({ error: "not_found" });

  const subscriptionId = transfer.rows[0].subscription_id;
  const subscriptionAccount = await query<{ account_id: number }>(
    `SELECT account_id FROM client_subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  const accountId = subscriptionAccount.rows[0]?.account_id;
  if (!accountId) return res.status(404).json({ error: "subscription_not_found" });

  await query(
    `UPDATE client_transfers
     SET status = 'rejected', admin_reviewed_at = NOW()
     WHERE id = $1`,
    [transferId],
  );
  await query(
    `UPDATE client_subscriptions
     SET status = 'rejected', approved_at = NULL
     WHERE id = $1`,
    [subscriptionId],
  );
  await query(`UPDATE client_accounts SET status = 'awaiting_payment' WHERE id = $1`, [accountId]);
  await query(`UPDATE client_api_keys SET status = 'pending' WHERE account_id = $1`, [accountId]);

  if (req.adminEmail) {
    await query(
      `INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
       VALUES ($1, $2, $3, $4)`,
      [req.adminEmail, "client_transfer_rejected", "client_transfer", String(transferId)],
    );
  }

  return res.json({ ok: true });
});

// Quick admin listing for manual approval workflows (transfer-based subscriptions).
adminRouter.get("/client/transfers/pending", async (_req, res: Response) => {
  const transfers = await query<{
    id: number;
    transaction_reference: string;
    amount: string;
    payer_name: string;
    status: string;
    created_at: Date;
    company_name: string;
    contact_email: string;
    plan_name: string;
    cycle: string;
  }>(
    `SELECT
       t.id,
       t.transaction_reference,
       t.amount::text AS amount,
       t.payer_name,
       t.status,
       t.created_at,
       a.company_name,
       a.contact_email,
       s.plan_name,
       s.cycle
     FROM client_transfers t
     JOIN client_subscriptions s ON s.id = t.subscription_id
     JOIN client_accounts a ON a.id = s.account_id
     WHERE t.status = 'pending_admin'
     ORDER BY t.created_at DESC
     LIMIT 100`,
  );

  return res.json({ transfers: transfers.rows });
});
