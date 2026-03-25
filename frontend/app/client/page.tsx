"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./client.module.scss";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

type ClientMeResponse = {
  account: {
    id: number;
    company_name: string;
    status: string;
    plan_name: string;
    cycle: string;
    created_at: string;
  } | null;
  subscription: {
    id: number;
    plan_name: string;
    cycle: string;
    amount_due: string;
    status: string;
    started_at: string;
    approved_at: string | null;
  } | null;
  latestTransfer: {
    id: number;
    transaction_reference: string;
    amount: string;
    status: string;
    created_at: string;
  } | null;
  billing: {
    bank: string;
    accountNumber: string;
    accountName: string;
  };
};

function authz(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ClientDashboardPage() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [me, setMe] = useState<ClientMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [signupCompany, setSignupCompany] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [pendingSignupToken, setPendingSignupToken] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [planName, setPlanName] = useState("Starter");
  const [cycle, setCycle] = useState("monthly");
  const [amountDue, setAmountDue] = useState("310.00");
  const [payerName, setPayerName] = useState("Onoja William Bosworth");
  const [transactionReference, setTransactionReference] = useState("");

  const hasSession = useMemo(() => token.length > 0, [token]);

  useEffect(() => {
    const savedToken = localStorage.getItem("credra_client_token") ?? "";
    const savedKey = localStorage.getItem("credra_client_apiKey") ?? "";
    if (savedToken) setToken(savedToken);
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`${API_BASE}/client/me`, {
          headers: { "Content-Type": "application/json", ...authz(token) },
        });
        if (!r.ok) throw new Error("Unable to load dashboard.");
        const data = (await r.json()) as ClientMeResponse;
        setMe(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Dashboard error");
      } finally {
        setLoading(false);
      }
    })();
  }, [hasSession, token]);

  async function onSignup() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/client/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: signupCompany,
          contactEmail: signupEmail,
          password: signupPassword,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Signup failed";
        throw new Error(msg);
      }
      if (body?.requiresOtp && body?.pendingToken) {
        setAwaitingOtp(true);
        setPendingSignupToken(String(body.pendingToken));
        setSignupOtp("");
        return;
      }
      throw new Error("OTP required but missing.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup error");
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupOtp() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/client/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken: pendingSignupToken,
          otp: signupOtp,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "OTP verification failed";
        throw new Error(msg);
      }
      const newToken = String(body?.token ?? "");
      const newKey = String(body?.apiKey ?? "");
      if (!newToken || !newKey) throw new Error("Missing token/apiKey after OTP verification.");

      setToken(newToken);
      setApiKey(newKey);
      localStorage.setItem("credra_client_token", newToken);
      localStorage.setItem("credra_client_apiKey", newKey);

      setAwaitingOtp(false);
      setPendingSignupToken("");
      setSignupOtp("");
      setAuthMode("login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP error");
    } finally {
      setLoading(false);
    }
  }

  async function resendSignupOtp() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/client/auth/otp/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: pendingSignupToken }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Resend failed";
        throw new Error(msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resend error");
    } finally {
      setLoading(false);
    }
  }

  async function onLogin() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/client/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Login failed";
        throw new Error(msg);
      }
      setToken(String(body.token ?? ""));
      localStorage.setItem("credra_client_token", String(body.token ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login error");
    } finally {
      setLoading(false);
    }
  }

  async function submitTransfer() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/client/subscription/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authz(token) },
        body: JSON.stringify({
          planName,
          cycle,
          amountDue,
          payerName,
          transactionReference,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Transfer request failed";
        throw new Error(msg);
      }
      // refresh
      const meR = await fetch(`${API_BASE}/client/me`, { headers: { ...authz(token) } });
      const data = (await meR.json()) as ClientMeResponse;
      setMe(data);
      setTransactionReference("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer error");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setToken("");
    setMe(null);
    setError("");
    localStorage.removeItem("credra_client_token");
    // keep apiKey so they can copy/paste even after logout
  }

  const accountStatus = me?.account?.status ?? "—";
  const subscriptionStatus = me?.subscription?.status ?? "—";

  return (
    <main className={styles.page}>
      <header className={hasSession ? styles.topBar : styles.centerTopBar}>
        <div>
          <h1 className={styles.title}>CREDRA Client</h1>
          <p className={styles.subtitle}>
            API access + subscription status. No admin controls.
          </p>
        </div>
        {hasSession ? (
          <button type="button" className={styles.ghostBtn} onClick={onLogout} disabled={loading}>
            Log out
          </button>
        ) : null}
      </header>

      {!hasSession ? (
        <div className={styles.centerStage}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {loading ? <p className={styles.loading}>Loading…</p> : null}

          <div className={styles.singleWrap}>
            {authMode === "login" ? (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Log in</h2>
                <div className={styles.field}>
                  <label>Email</label>
                  <input
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    type="email"
                    autoComplete="username"
                  />
                </div>
                <div className={styles.field}>
                  <label>Password</label>
                  <input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={onLogin}
                  disabled={loading}
                >
                  {loading ? "Logging in…" : "Log in"}
                </button>

                <p className={styles.switchLine}>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className={styles.switchLink}
                    onClick={() => setAuthMode("signup")}
                    disabled={loading}
                  >
                    Sign up
                  </button>
                </p>
              </section>
            ) : (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Sign up</h2>
                <div className={styles.field}>
                  <label>Company name</label>
                  <input
                    value={signupCompany}
                    onChange={(e) => setSignupCompany(e.target.value)}
                    disabled={loading || awaitingOtp}
                  />
                </div>
                <div className={styles.field}>
                  <label>Contact email</label>
                  <input
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    disabled={loading || awaitingOtp}
                  />
                </div>
                <div className={styles.field}>
                  <label>Password</label>
                  <input
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    disabled={loading || awaitingOtp}
                  />
                </div>
                {awaitingOtp ? (
                  <>
                    <div className={styles.field}>
                      <label>OTP code</label>
                      <input
                        value={signupOtp}
                        onChange={(e) => setSignupOtp(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={verifySignupOtp}
                      disabled={loading || !signupOtp.trim()}
                    >
                      {loading ? "Verifying…" : "Verify OTP"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={resendSignupOtp}
                      disabled={loading}
                    >
                      Resend code
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.primaryBtn} onClick={onSignup} disabled={loading}>
                    {loading ? "Signing up…" : "Create account"}
                  </button>
                )}

                <p className={styles.switchLine}>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className={styles.switchLink}
                    onClick={() => setAuthMode("login")}
                    disabled={loading}
                  >
                    Back to login
                  </button>
                </p>
              </section>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 className={styles.cardTitle}>
            {me?.account?.company_name ?? "Your account"} dashboard
          </h2>

          <div className={styles.kv}>
            <div className={styles.kvItem}>
              <div className={styles.kvLabel}>Account status</div>
              <div className={styles.kvValue}>{accountStatus}</div>
            </div>
            <div className={styles.kvItem}>
              <div className={styles.kvLabel}>Subscription status</div>
              <div className={styles.kvValue}>{subscriptionStatus}</div>
            </div>
            <div className={styles.kvItem}>
              <div className={styles.kvLabel}>Plan</div>
              <div className={styles.kvValue}>{me?.account?.plan_name ?? "—"}</div>
            </div>
            <div className={styles.kvItem}>
              <div className={styles.kvLabel}>Cycle</div>
              <div className={styles.kvValue}>{me?.account?.cycle ?? "—"}</div>
            </div>
          </div>

          <div className={styles.subSection}>
            <h3 className={styles.subTitle}>Pay via bank transfer</h3>
            <p className={styles.muted}>
              Send payment to the receiving details below, then submit your transaction reference.
            </p>
            <div className={styles.bankBox}>
              <div>
                <div className={styles.bankLabel}>Bank</div>
                <div className={styles.bankValue}>{me?.billing.bank ?? "—"}</div>
              </div>
              <div>
                <div className={styles.bankLabel}>Account number</div>
                <div className={styles.bankValue}>{me?.billing.accountNumber ?? "—"}</div>
              </div>
              <div>
                <div className={styles.bankLabel}>Account name</div>
                <div className={styles.bankValue}>{me?.billing.accountName ?? "—"}</div>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label>Plan name</label>
                <input value={planName} onChange={(e) => setPlanName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Cycle</label>
                <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                  <option value="monthly">monthly</option>
                  <option value="yearly">yearly</option>
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label>Amount due</label>
                <input value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Payer name</label>
                <input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
              </div>
            </div>

            <div className={styles.field}>
              <label>Transaction reference</label>
              <input
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                placeholder="e.g. TRX/xxxxxxxx"
              />
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={submitTransfer}
              disabled={loading || !transactionReference.trim()}
            >
              {loading ? "Submitting…" : "Submit transfer reference"}
            </button>

            {me?.latestTransfer ? (
              <p className={styles.note}>
                Latest transfer: <strong>{me.latestTransfer.transaction_reference}</strong> (
                {me.latestTransfer.status}) for {me.latestTransfer.amount}
              </p>
            ) : null}
          </div>

          <div className={styles.subSection}>
            <h3 className={styles.subTitle}>Your API key</h3>
            <p className={styles.muted}>
              Your API key becomes active after admin approves your transfer.
            </p>
            <div className={styles.apiKeyRow}>
              <code className={styles.apiKey}>{apiKey || "—"}</code>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => {
                  if (!apiKey) return;
                  void navigator.clipboard.writeText(apiKey);
                }}
              >
                Copy
              </button>
            </div>
            <p className={styles.note}>
              Endpoints: <span className={styles.mono}>POST /api/v1/client/credit-score</span>,{" "}
              <span className={styles.mono}>POST /api/v1/client/fraud-check</span>
            </p>
          </div>
        </>
      )}
    </main>
  );
}

