"use client";

import Connect from "@mono.co/connect.js";
import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { CredraLogo } from "../components/CredraLogo";
import { AdminUsageChart } from "./AdminUsageChart";
import styles from "./admin.module.scss";

type LoginResponse = {
  requiresTotp?: boolean;
  pendingToken?: string;
  token?: string;
  admin: { email: string; name: string; role: string };
  expiresInHours?: number;
};

type PanelResponse = {
  dashboard: {
    total_users: number;
    active_api_requests: number;
    loan_insurance_processed: number;
    fraud_alerts: number;
    revenue: string;
    system_uptime: string;
    system_errors: number;
  } | null;
  userManagement: { clients: Array<Record<string, unknown>> };
  dataManagement: {
    integrations: Array<Record<string, unknown>>;
    ingestionRuns: Array<Record<string, unknown>>;
    auditTrails: Array<Record<string, unknown>>;
  };
  aiModelMonitoring: {
    versions: Array<Record<string, unknown>>;
    recentPredictions: Array<Record<string, unknown>>;
  };
  apiManagement: { keys: Array<Record<string, unknown>> };
  transactionsRiskReview: { flaggedItems: Array<Record<string, unknown>> };
  billingSubscriptions: {
    pendingTransfers: Array<Record<string, unknown>>;
    subscriptions: Array<Record<string, unknown>>;
  };
  settingsConfiguration: { values: Array<Record<string, unknown>> };
  securityCompliance: { events: Array<Record<string, unknown>> };
  analyticsReporting: { usageDaily: Array<Record<string, unknown>> };
  extras: {
    notificationsEnabled: boolean;
    exportFormats: string[];
    roleSpecificDashboards: string[];
  };
};

const SECTIONS = [
  { id: "overview", num: 1, label: "Overview", desc: "Headline KPIs and platform health." },
  { id: "users", num: 2, label: "User management", desc: "Clients, roles, and API usage by tenant." },
  { id: "data", num: 3, label: "Data management", desc: "Integrations, ingestion runs, and audit trails." },
  { id: "ai", num: 4, label: "AI monitoring", desc: "Model versions, metrics, and recent predictions." },
  { id: "api", num: 5, label: "API management", desc: "Keys, rate limits, and traffic." },
  { id: "risk", num: 6, label: "Risk & compliance", desc: "Flagged reviews and compliance exports." },
  {
    id: "billing",
    num: 7,
    label: "Billing",
    desc: "Pending bank transfer reviews and client subscriptions.",
  },
  { id: "settings", num: 8, label: "Settings", desc: "Configuration keys and thresholds." },
  { id: "security", num: 9, label: "Security", desc: "Security events and audit signals." },
  { id: "analytics", num: 10, label: "Analytics", desc: "Usage trends, exports, and reporting." },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const MONO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY ?? "";

const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  (API_BASE.replace(/\/api\/v1\/?$/, "") || "http://localhost:4000");

function isLikelyNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message)) {
    return true;
  }
  return false;
}

function isLocalApiOrigin(): boolean {
  try {
    const u = new URL(API_ORIGIN);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function networkFailureHint(): string {
  if (isLocalApiOrigin()) {
    return `Cannot reach the API (${API_ORIGIN}). Start the backend locally: cd backend && npm install && npm run dev — then open ${API_ORIGIN}/health`;
  }
  return [
    `Cannot reach the API (${API_ORIGIN}).`,
    `Open ${API_ORIGIN}/health or ${API_ORIGIN}/api/v1/health in a new tab — you should see JSON {"ok":true,...}. If you get HTML "Not found", the Render service may be the wrong app (root directory must be backend) or needs redeploy.`,
    `If health returns JSON but this page still fails, check CORS and redeploy the frontend after setting NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_API_ORIGIN.`,
  ].join(" ");
}

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function tableKeys(rows: Array<Record<string, unknown>>): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => keys.add(k));
  }
  return [...keys];
}

function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) {
    return <p className={styles.emptyNote}>No records yet.</p>;
  }
  const keys = tableKeys(rows);
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k.replace(/_/g, " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`r-${i}`}>
              {keys.map((k) => (
                <td key={k}>{row[k] != null && row[k] !== "" ? String(row[k]) : "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function extractMonoAccountId(payload: Record<string, unknown>): string {
  const data = payload.data as Record<string, unknown> | undefined;
  const candidates: Array<unknown> = [
    payload.id,
    payload.account,
    payload.account_id,
    payload.accountId,
    data?.id,
    data?.account_id,
    data?.account,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [awaitingTotp, setAwaitingTotp] = useState(false);
  const [token, setToken] = useState("");
  const [adminName, setAdminName] = useState("");
  const [panel, setPanel] = useState<PanelResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");

  const isLoggedIn = useMemo(() => token.length > 0, [token]);

  const monoRef = useRef<Connect | null>(null);
  const [monoCode, setMonoCode] = useState("");
  const [monoAccountId, setMonoAccountId] = useState("");
  const [monoExchange, setMonoExchange] = useState<Record<string, unknown> | null>(null);
  const [monoBalance, setMonoBalance] = useState<Record<string, unknown> | null>(null);
  const [monoTransactions, setMonoTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [monoError, setMonoError] = useState("");
  const [transferBusy, setTransferBusy] = useState<number | null>(null);

  const activeMeta = useMemo(
    () => SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0],
    [activeSection],
  );

  const fetchPanelData = useCallback(async (authToken: string) => {
    const response = await fetch(`${API_BASE}/admin/panel`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(authToken),
      },
    });
    if (!response.ok) {
      throw new Error("Unable to fetch admin panel data.");
    }
    const data = (await response.json()) as PanelResponse;
    setPanel(data);
  }, []);

  const settleClientTransfer = useCallback(
    async (id: number, action: "approve" | "reject") => {
      if (!token) return;
      setTransferBusy(id);
      setError("");
      try {
        const r = await fetch(`${API_BASE}/admin/client/transfers/${id}/${action}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders(token) },
        });
        if (!r.ok) {
          const b = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(typeof b?.error === "string" ? b.error : "Request failed");
        }
        await fetchPanelData(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transfer action failed");
      } finally {
        setTransferBusy(null);
      }
    },
    [token, fetchPanelData],
  );

  const exchangeMonoCodeForAccount = useCallback(async (code: string) => {
    const response = await fetch(`${API_BASE}/integrations/mono/token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ code }),
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const msg = typeof body?.error === "string" ? body.error : "Mono token exchange failed.";
      throw new Error(msg);
    }

    const data = body ?? {};
    setMonoExchange(data);
    const accountId = extractMonoAccountId(data);
    if (accountId) setMonoAccountId(accountId);
  }, [token]);

  const openMonoConnect = useCallback(async () => {
    setMonoError("");
    setMonoBalance(null);
    setMonoTransactions([]);

    if (!MONO_PUBLIC_KEY) {
      setMonoError(
        "Missing NEXT_PUBLIC_MONO_PUBLIC_KEY. Add it in frontend/.env.local and restart the frontend.",
      );
      return;
    }

    if (!monoRef.current) {
      monoRef.current = new Connect({
        key: MONO_PUBLIC_KEY,
        onSuccess: async (payload: { code?: string }) => {
          const code = String(payload?.code ?? "");
          if (!code) {
            setMonoError("Mono returned no auth code.");
            return;
          }
          setMonoCode(code);
          try {
            await exchangeMonoCodeForAccount(code);
          } catch (e) {
            setMonoError(e instanceof Error ? e.message : "Mono exchange failed.");
          }
        },
        onClose: () => {
          // user closed widget
        },
      });
      monoRef.current.setup();
    }

    monoRef.current.open();
  }, [exchangeMonoCodeForAccount]);

  const fetchMonoBalance = useCallback(async () => {
    setMonoError("");
    setMonoBalance(null);
    if (!monoAccountId) {
      setMonoError("No account id yet. Connect an account first.");
      return;
    }
    const response = await fetch(
      `${API_BASE}/integrations/mono/accounts/${encodeURIComponent(monoAccountId)}/balance`,
      { credentials: "include", headers: { ...authHeaders(token) } },
    );
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const msg = typeof body?.error === "string" ? body.error : "Failed to fetch balance.";
      setMonoError(msg);
      return;
    }
    setMonoBalance(body ?? {});
  }, [monoAccountId, token]);

  const fetchMonoTransactions = useCallback(async () => {
    setMonoError("");
    setMonoTransactions([]);
    if (!monoAccountId) {
      setMonoError("No account id yet. Connect an account first.");
      return;
    }
    const response = await fetch(
      `${API_BASE}/integrations/mono/accounts/${encodeURIComponent(monoAccountId)}/transactions`,
      { credentials: "include", headers: { ...authHeaders(token) } },
    );
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const msg = typeof body?.error === "string" ? body.error : "Failed to fetch transactions.";
      setMonoError(msg);
      return;
    }
    const arr = (body?.data as unknown) ?? [];
    setMonoTransactions(Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : []);
  }, [monoAccountId, token]);

  async function downloadExport(path: string, filename: string, authToken: string) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: authHeaders(authToken),
    });
    if (!response.ok) {
      throw new Error("Download failed.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (response.status === 503 && errBody?.message) {
          throw new Error(errBody.message);
        }
        throw new Error("Invalid admin credentials.");
      }
      const data = (await response.json()) as LoginResponse;

      if (data.requiresTotp && data.pendingToken) {
        setAwaitingTotp(true);
        setPendingToken(data.pendingToken);
        setAdminName(data.admin.name);
        setTotpCode("");
        return;
      }

      const access = data.token ?? "";
      if (!access) {
        throw new Error("No session token returned.");
      }
      setToken(access);
      setAdminName(data.admin.name);
      setAwaitingTotp(false);
      setPendingToken("");
      await fetchPanelData(access);
    } catch (err) {
      setError(isLikelyNetworkFailure(err) ? networkFailureHint() : err instanceof Error ? err.message : "Unable to login.");
    } finally {
      setLoading(false);
    }
  }

  async function onTotpSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/admin/auth/totp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code: totpCode }),
      });
      if (!response.ok) {
        throw new Error("Invalid authenticator code.");
      }
      const data = (await response.json()) as LoginResponse;
      const access = data.token ?? "";
      if (!access) {
        throw new Error("No session token returned.");
      }
      setToken(access);
      setAwaitingTotp(false);
      setPendingToken("");
      setTotpCode("");
      await fetchPanelData(access);
    } catch (err) {
      setError(
        isLikelyNetworkFailure(err)
          ? networkFailureHint()
          : err instanceof Error
            ? err.message
            : "2FA verification failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      await fetchPanelData(token);
    } catch (err) {
      setError(
        isLikelyNetworkFailure(err)
          ? networkFailureHint()
          : err instanceof Error
            ? err.message
            : "Unable to refresh.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLoading(true);
    setError("");
    try {
      await fetch(`${API_BASE}/admin/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(token),
      });
    } catch {
      /* still clear local session */
    } finally {
      setToken("");
      setPanel(null);
      setAdminName("");
      setAwaitingTotp(false);
      setPendingToken("");
      setTotpCode("");
      setActiveSection("overview");
      setLoading(false);
    }
  }

  function renderPanelSection(p: PanelResponse) {
    switch (activeSection) {
      case "overview": {
        const d = p.dashboard;
        if (!d) {
          return <p className={styles.emptyNote}>No dashboard snapshot loaded.</p>;
        }
        const stats = [
          { label: "Users / clients", value: String(d.total_users) },
          { label: "Active API requests", value: String(d.active_api_requests) },
          { label: "Loan / insurance processed", value: String(d.loan_insurance_processed) },
          { label: "Fraud alerts", value: String(d.fraud_alerts) },
          { label: "Revenue", value: d.revenue ?? "—" },
          { label: "System uptime", value: d.system_uptime ?? "—" },
          { label: "System errors", value: String(d.system_errors) },
        ];
        return (
          <div className={styles.statGrid}>
            {stats.map((s) => (
              <div className={styles.statCard} key={s.label}>
                <span className={styles.statLabel}>{s.label}</span>
                <span className={styles.statValue}>{s.value}</span>
              </div>
            ))}
          </div>
        );
      }
      case "users":
        return <DataTable rows={p.userManagement.clients} />;
      case "data":
        return (
          <>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Connect bank account (Mono)</h3>
              <p className={styles.mutedNote}>
                Use Mono Connect to link an account and then fetch balance / transactions through the backend.
              </p>
              <div className={styles.exportRow}>
                <button type="button" className={styles.exportBtn} onClick={openMonoConnect}>
                  Connect bank account
                </button>
                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={fetchMonoBalance}
                  disabled={!monoAccountId}
                >
                  Fetch balance
                </button>
                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={fetchMonoTransactions}
                  disabled={!monoAccountId}
                >
                  Fetch transactions
                </button>
              </div>
              {monoError ? <p className={styles.error}>{monoError}</p> : null}
              <div className={styles.kvGrid}>
                <div>
                  <div className={styles.kvLabel}>Auth code</div>
                  <div className={styles.kvValue}>{monoCode || "—"}</div>
                </div>
                <div>
                  <div className={styles.kvLabel}>Account id</div>
                  <div className={styles.kvValue}>{monoAccountId || "—"}</div>
                </div>
              </div>
              {monoExchange ? (
                <div className={styles.subBlockInner}>
                  <h4 className={styles.subTitle}>Exchange response</h4>
                  <pre className={styles.codeBlock}>{JSON.stringify(monoExchange, null, 2)}</pre>
                </div>
              ) : null}
              {monoBalance ? (
                <div className={styles.subBlockInner}>
                  <h4 className={styles.subTitle}>Balance response</h4>
                  <pre className={styles.codeBlock}>{JSON.stringify(monoBalance, null, 2)}</pre>
                </div>
              ) : null}
              {monoTransactions.length ? (
                <div className={styles.subBlockInner}>
                  <h4 className={styles.subTitle}>Transactions</h4>
                  <DataTable rows={monoTransactions} />
                </div>
              ) : null}
            </div>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Integrations</h3>
              <DataTable rows={p.dataManagement.integrations} />
            </div>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Ingestion runs</h3>
              <DataTable rows={p.dataManagement.ingestionRuns} />
            </div>
            {p.dataManagement.auditTrails.length > 0 ? (
              <div className={styles.subBlock}>
                <h3 className={styles.subTitle}>Audit trails</h3>
                <DataTable rows={p.dataManagement.auditTrails} />
              </div>
            ) : null}
          </>
        );
      case "ai":
        return (
          <>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Model versions &amp; metrics</h3>
              <DataTable rows={p.aiModelMonitoring.versions} />
            </div>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Recent predictions</h3>
              <DataTable rows={p.aiModelMonitoring.recentPredictions} />
            </div>
          </>
        );
      case "api":
        return <DataTable rows={p.apiManagement.keys} />;
      case "risk":
        return (
          <>
            <DataTable rows={p.transactionsRiskReview.flaggedItems} />
            <div className={styles.exportRow}>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={() =>
                  downloadExport("/admin/exports/compliance.csv", "credra-compliance.csv", token)
                }
              >
                Download compliance CSV
              </button>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={() =>
                  downloadExport("/admin/exports/compliance.pdf", "credra-compliance.pdf", token)
                }
              >
                Download compliance PDF
              </button>
            </div>
          </>
        );
      case "billing": {
        const pending = p.billingSubscriptions.pendingTransfers ?? [];
        return (
          <>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Pending bank transfer verifications</h3>
              <p className={styles.mutedNote}>
                Clients submit a reference after paying. Approve when funds are confirmed — API keys
                activate on approval.
              </p>
              {!pending.length ? (
                <p className={styles.emptyNote}>No pending transfer requests.</p>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Company</th>
                        <th>Contact</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Plan</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((row) => {
                        const rid = Number(row.id);
                        const busy = transferBusy === rid;
                        return (
                          <tr key={String(row.id)}>
                            <td>{String(row.id)}</td>
                            <td>{String(row.company_name ?? "—")}</td>
                            <td>{String(row.contact_email ?? "—")}</td>
                            <td>{String(row.amount ?? "—")}</td>
                            <td>{String(row.transaction_reference ?? "—")}</td>
                            <td>
                              {String(row.plan_name ?? "—")} / {String(row.cycle ?? "—")}
                            </td>
                            <td>
                              <div className={styles.transferActions}>
                                <button
                                  type="button"
                                  className={styles.exportBtn}
                                  disabled={busy}
                                  onClick={() => void settleClientTransfer(rid, "approve")}
                                >
                                  {busy ? "…" : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  disabled={busy}
                                  onClick={() => void settleClientTransfer(rid, "reject")}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className={styles.subBlock}>
              <h3 className={styles.subTitle}>Subscriptions</h3>
              <DataTable rows={p.billingSubscriptions.subscriptions} />
            </div>
          </>
        );
      }
      case "settings":
        return <DataTable rows={p.settingsConfiguration.values} />;
      case "security":
        return <DataTable rows={p.securityCompliance.events} />;
      case "analytics":
        return (
          <>
            <AdminUsageChart rows={p.analyticsReporting.usageDaily} />
            <div className={styles.extrasRow}>
              <span>
                <strong>Notifications:</strong>{" "}
                {p.extras.notificationsEnabled ? "enabled" : "disabled"}
              </span>
              <span>
                <strong>Export formats:</strong> {p.extras.exportFormats.join(", ") || "—"}
              </span>
              <span>
                <strong>Role dashboards:</strong>{" "}
                {p.extras.roleSpecificDashboards.join(", ") || "—"}
              </span>
            </div>
          </>
        );
      default:
        return null;
    }
  }

  function NavButton({
    s,
    variant,
  }: {
    s: (typeof SECTIONS)[number];
    variant: "rail" | "sidebar";
  }) {
    const active = activeSection === s.id;
    if (variant === "rail") {
      return (
        <button
          key={s.id}
          type="button"
          className={`${styles.navBtn} ${active ? styles.navBtnActive : ""}`}
          onClick={() => setActiveSection(s.id)}
        >
          <span className={styles.navBtnNum}>{s.num}</span>
          {s.label}
        </button>
      );
    }
    return (
      <button
        key={s.id}
        type="button"
        className={`${styles.sidebarBtn} ${active ? styles.sidebarBtnActive : ""}`}
        onClick={() => setActiveSection(s.id)}
      >
        <span className={styles.sidebarBtnNum}>{s.num}</span>
        <span className={styles.sidebarBtnText}>{s.label}</span>
      </button>
    );
  }

  if (!isLoggedIn && awaitingTotp) {
    return (
      <main className={styles.authWrap}>
        <form className={styles.authCard} onSubmit={onTotpSubmit}>
          <div className={styles.authLogo}>
            <CredraLogo height={40} />
          </div>
          <h1>Two-factor authentication</h1>
          <p>
            Enter the 6-digit code from your authenticator app for{" "}
            <strong>{email}</strong>.
          </p>
          <label>
            Authenticator code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="000000"
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify & continue"}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            style={{ marginTop: "0.25rem" }}
            onClick={() => {
              setAwaitingTotp(false);
              setPendingToken("");
              setTotpCode("");
              setError("");
            }}
          >
            Back to login
          </button>
        </form>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className={styles.authWrap}>
        <form className={styles.authCard} onSubmit={onLogin}>
          <div className={styles.authLogo}>
            <CredraLogo height={40} />
          </div>
          <h1>Admin Login</h1>
          <p>Use your admin credentials to access the CREDRA control panel.</p>
          <label>
            Email
            <input
              name="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              name="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brandHeader}>
          <CredraLogo className={styles.brandLogo} height={36} />
          <div>
            <h1>CREDRA Admin</h1>
            <p className={styles.subtitle}>
              Signed in as <strong>{adminName}</strong> — operations, risk, billing, and compliance.
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
          <button type="button" className={styles.btnGhost} onClick={onLogout} disabled={loading}>
            Log out
          </button>
        </div>
      </header>

      {error ? <p className={styles.bannerError}>{error}</p> : null}
      {!panel ? <p className={styles.loadingBanner}>Loading panel…</p> : null}

      {panel ? (
        <>
          <nav className={styles.navRail} aria-label="Panel sections">
            {SECTIONS.map((s) => (
              <NavButton key={s.id} s={s} variant="rail" />
            ))}
          </nav>

          <div className={styles.panelLayout}>
            <aside className={styles.navSidebar} aria-label="Panel sections">
              <div className={styles.navSidebarLabel}>Sections</div>
              {SECTIONS.map((s) => (
                <NavButton key={`sb-${s.id}`} s={s} variant="sidebar" />
              ))}
            </aside>

            <div className={styles.mainScroll}>
              <section className={styles.section} aria-labelledby="section-title">
                <header className={styles.sectionHead}>
                  <h2 id="section-title">
                    {activeMeta.num}. {activeMeta.label}
                  </h2>
                  <p>{activeMeta.desc}</p>
                </header>
                {renderPanelSection(panel)}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
