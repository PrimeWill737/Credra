"use client";

import Connect from "@mono.co/connect.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CredraLogo } from "../components/CredraLogo";
import { FlashNotices } from "../components/FlashNotices";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { SignupSuccess } from "../components/SignupSuccess";
import { ClientAiInsight, type AiEndpointKind } from "./ClientAiInsight";
import {
  isPlausibleEmail,
  sanitizeBillingCycle,
  sanitizeEmailInput,
  sanitizeMonoAuthCode,
  sanitizeOrganizationName,
  sanitizeOtpDigits,
  sanitizePasswordInput,
  sanitizePendingToken,
  sanitizePersonName,
  sanitizePlanNameInput,
  sanitizePositiveIntegerString,
  sanitizeSignedDecimalInput,
  sanitizeTransactionReference,
  sanitizeUnsignedDecimalInput,
  sanitizeVolatilityHintInput,
} from "../lib/inputSanitize";
import { CREDRA_CLIENT_TOKEN_LS_KEY } from "../lib/clientSessionStorage";
import {
  humanizeApiSlug,
  humanizeMonoForUser,
  humanizeNetworkFailure,
} from "../lib/userFacingMessages";
import { PLAN_CARDS, type PlanCard } from "./planCatalog";
import styles from "./client.module.scss";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const MONO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY ?? "";
const MONO_ACCOUNT_LS = "credra_client_mono_account_id";

const CLIENT_NAV: {
  id: "dashboard" | "credra-ai" | "subscription" | "api-key" | "settings";
  label: string;
}[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "credra-ai", label: "Credra AI" },
  { id: "subscription", label: "Subscription" },
  { id: "api-key", label: "API key" },
  { id: "settings", label: "Settings" },
];

function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateLabel(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickFirstNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const n = coerceNumber(source[key]);
    if (n !== null) return n;
  }
  return null;
}

function pickFirstString(
  source: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const v = source[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "—";
}

function formatNgnCompact(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

type PlaygroundPath = "score" | "fraud-check" | "risk-analysis";

function pathToInsightKind(p: PlaygroundPath): AiEndpointKind {
  if (p === "score") return "credit-score";
  return p;
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

function pickMonoString(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  for (const k of keys) {
    const top = payload[k];
    if (typeof top === "string" && top.trim()) return top;
    const nested = data?.[k];
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return undefined;
}

function MonoExchangeSummary({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const isStub = payload._stub === true;
  const accountId = extractMonoAccountId(payload);
  const meta = payload.meta as Record<string, unknown> | undefined;
  const institution = pickMonoString(payload, [
    "institution",
    "institution_name",
    "bank_name",
    "institutionName",
  ]);
  const accountName = pickMonoString(payload, [
    "account_name",
    "name",
    "accountName",
  ]);

  if (isStub) {
    return (
      <div className={styles.exchangeSummary}>
        <p className={styles.exchangeSummaryLead}>
          This is a practice bank link so you can try the flow without a live
          connection.
        </p>
        {typeof payload.message === "string" ? (
          <p className={styles.exchangeSummaryNote}>{payload.message}</p>
        ) : null}
        {accountId ? (
          <p className={styles.exchangeSummaryNote}>
            Practice reference: {accountId}
          </p>
        ) : null}
      </div>
    );
  }

  const dataStatus =
    typeof meta?.data_status === "string"
      ? meta.data_status
      : typeof meta?.status === "string"
        ? meta.status
        : undefined;

  return (
    <div className={styles.exchangeSummary}>
      <p className={styles.exchangeSummaryLead}>
        Bank connection succeeded. This account is linked — you can fetch
        balance or transactions next.
      </p>
      <ul className={styles.exchangeSummaryList}>
        {accountId ? (
          <li>
            <span className={styles.exchangeSummaryKey}>Linked account id</span>
            <span className={styles.exchangeSummaryVal}>{accountId}</span>
          </li>
        ) : null}
        {institution ? (
          <li>
            <span className={styles.exchangeSummaryKey}>Institution</span>
            <span className={styles.exchangeSummaryVal}>{institution}</span>
          </li>
        ) : null}
        {accountName ? (
          <li>
            <span className={styles.exchangeSummaryKey}>Account</span>
            <span className={styles.exchangeSummaryVal}>{accountName}</span>
          </li>
        ) : null}
        {dataStatus ? (
          <li>
            <span className={styles.exchangeSummaryKey}>Data status</span>
            <span className={styles.exchangeSummaryVal}>{dataStatus}</span>
          </li>
        ) : null}
      </ul>
      {!accountId && !institution && !accountName ? (
        <p className={styles.exchangeSummaryNote}>
          Mono confirmed the link. Use the buttons above to load balance or
          transaction history when data is ready.
        </p>
      ) : null}
    </div>
  );
}

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
  stats?: {
    api_calls_30d: number;
  };
};

function authz(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function humanizeAuthError(message: string): string {
  const m = message.trim();
  const key = m.toLowerCase();

  const direct: Record<string, string> = {
    invalid_numbers: "Please enter valid numbers in all fields.",
    dashboard_load_failed: "We couldn't load your workspace. Refresh the page or try again shortly.",
    missing_required_fields: "Please fill out all required fields.",
    email_already_registered:
      "That email is already registered. Please log in instead.",
    signup_failed: "We couldn't start your signup. Please try again.",
    pending_token_required:
      "Please restart the signup flow and request a new code.",
    invalid_pending_token: "Your signup session expired. Please sign up again.",
    pending_token_and_otp_required: "Enter the 6-digit code and try again.",
    otp_invalid: "That code isn't valid. Please check and try again.",
    otp_consumed: "That code has already been used. Request a new one.",
    otp_expired: "That code has expired. Request a new one.",
    email_and_password_required: "Please enter your email and password.",
    invalid_credentials: "Incorrect email or password. Please try again.",
    login_incomplete: "Sign-in didn't finish. Please try again.",
    "otp required but missing.":
      "We couldn't start the verification step. Please try again.",
    "missing token/apikey after otp verification.":
      "We couldn't finish setting up your account. Please try signing up again.",
  };

  if (direct[key]) return direct[key];
  if (key.includes("otp_expired")) return direct["otp_expired"];
  if (key.includes("otp_consumed")) return direct["otp_consumed"];
  if (key.includes("otp_invalid")) return direct["otp_invalid"];
  if (key.includes("email_already_registered"))
    return direct["email_already_registered"];
  if (key.includes("invalid_credentials")) return direct["invalid_credentials"];

  if (/network|failed to fetch|load failed/i.test(m))
    return humanizeNetworkFailure();
  if (/^[a-z0-9_]+$/.test(key) && key.length > 2) {
    return humanizeApiSlug(m);
  }
  if (m.length > 0 && m.length < 160 && !m.includes("_")) return m;
  return "Something went wrong. Please try again.";
}

export default function ClientDashboardPage() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [me, setMe] = useState<ClientMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [flashError, setFlashError] = useState("");
  const [flashSuccess, setFlashSuccess] = useState("");

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [signupCompany, setSignupCompany] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [pendingSignupToken, setPendingSignupToken] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupSuccessToken, setSignupSuccessToken] = useState("");
  const [signupSuccessApiKey, setSignupSuccessApiKey] = useState("");

  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loginSuccessToken, setLoginSuccessToken] = useState("");
  const [loginSuccessName, setLoginSuccessName] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [planName, setPlanName] = useState("Starter");
  const [cycle, setCycle] = useState("monthly");
  const [amountDue, setAmountDue] = useState("310.00");
  const [payerName, setPayerName] = useState("Onoja William Bosworth");
  const [transactionReference, setTransactionReference] = useState("");

  const monoRef = useRef<Connect | null>(null);
  const transferSectionRef = useRef<HTMLElement | null>(null);
  const [monoCode, setMonoCode] = useState("");
  const [monoAccountId, setMonoAccountId] = useState("");
  const [monoExchange, setMonoExchange] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [monoBalance, setMonoBalance] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [monoTransactions, setMonoTransactions] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [monthlyIncome, setMonthlyIncome] = useState("4500");
  const [monthlySpend, setMonthlySpend] = useState("3800");
  const [txCount, setTxCount] = useState("42");
  const [volatilityHint, setVolatilityHint] = useState("0.25");
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [playgroundData, setPlaygroundData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [playgroundKind, setPlaygroundKind] = useState<AiEndpointKind | null>(
    null,
  );

  const [activeNav, setActiveNav] = useState<
    "dashboard" | "credra-ai" | "subscription" | "api-key" | "settings"
  >("dashboard");

  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const hasSession = useMemo(() => token.length > 0, [token]);

  const showLoadingOverlay = useMemo(
    () =>
      (!hasSession && (loading || loginSubmitting)) ||
      (hasSession &&
        (loading ||
          pwdSubmitting ||
          cancelSubmitting ||
          playgroundLoading)),
    [
      hasSession,
      loading,
      loginSubmitting,
      pwdSubmitting,
      cancelSubmitting,
      playgroundLoading,
    ],
  );

  useEffect(() => {
    const savedToken = localStorage.getItem(CREDRA_CLIENT_TOKEN_LS_KEY) ?? "";
    const savedKey = localStorage.getItem("credra_client_apiKey") ?? "";
    if (savedToken) setToken(savedToken);
    if (savedKey) setApiKey(savedKey);
    const savedMono = localStorage.getItem(MONO_ACCOUNT_LS) ?? "";
    if (savedMono) setMonoAccountId(savedMono);
  }, []);

  const exchangeMonoCodeForAccount = useCallback(async (code: string) => {
    const clean = sanitizeMonoAuthCode(code);
    if (!clean) {
      throw new Error("no auth code");
    }
    const response = await fetch(`${API_BASE}/integrations/mono/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: clean }),
    });
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const msg =
        typeof body?.error === "string"
          ? body.error
          : "Mono token exchange failed.";
      throw new Error(msg);
    }
    const data = body ?? {};
    setMonoExchange(data);
    const accountId = extractMonoAccountId(data);
    if (accountId) {
      setMonoAccountId(accountId);
      localStorage.setItem(MONO_ACCOUNT_LS, accountId);
    }
  }, []);

  const openMonoConnect = useCallback(async () => {
    setFlashError("");
    setFlashSuccess("");
    setMonoBalance(null);
    setMonoTransactions([]);

    if (!MONO_PUBLIC_KEY) {
      setFlashError(humanizeMonoForUser("missing public key", "connect"));
      return;
    }

    if (!monoRef.current) {
      monoRef.current = new Connect({
        key: MONO_PUBLIC_KEY,
        onSuccess: async (payload: { code?: string }) => {
          const code = sanitizeMonoAuthCode(String(payload?.code ?? ""));
          if (!code) {
            setFlashError(humanizeMonoForUser("no auth code", "connect"));
            return;
          }
          setMonoCode(code);
          try {
            await exchangeMonoCodeForAccount(code);
            setFlashSuccess("Bank linked successfully.");
          } catch (e) {
            setFlashError(
              humanizeMonoForUser(
                e instanceof Error ? e.message : "exchange failed",
                "connect",
              ),
            );
          }
        },
        onClose: () => {
          /* user closed widget */
        },
      });
      monoRef.current.setup();
    }

    monoRef.current.open();
  }, [exchangeMonoCodeForAccount]);

  const fetchMonoBalance = useCallback(async () => {
    setFlashError("");
    setFlashSuccess("");
    setMonoBalance(null);
    if (!monoAccountId) {
      setFlashError(humanizeMonoForUser("connect first", "balance"));
      return;
    }
    const response = await fetch(
      `${API_BASE}/integrations/mono/accounts/${encodeURIComponent(monoAccountId)}/balance`,
    );
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const msg =
        typeof body?.error === "string" ? body.error : "balance_failed";
      setFlashError(humanizeMonoForUser(msg, "balance"));
      return;
    }
    setMonoBalance(body ?? {});
    setFlashSuccess("Balance updated.");
  }, [monoAccountId]);

  const fetchMonoTransactions = useCallback(async () => {
    setFlashError("");
    setFlashSuccess("");
    setMonoTransactions([]);
    if (!monoAccountId) {
      setFlashError(humanizeMonoForUser("connect first", "transactions"));
      return;
    }
    const response = await fetch(
      `${API_BASE}/integrations/mono/accounts/${encodeURIComponent(monoAccountId)}/transactions`,
    );
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const msg =
        typeof body?.error === "string" ? body.error : "transactions_failed";
      setFlashError(humanizeMonoForUser(msg, "transactions"));
      return;
    }
    const arr = (body?.data as unknown) ?? [];
    setMonoTransactions(
      Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [],
    );
    setFlashSuccess("Transactions loaded.");
  }, [monoAccountId]);

  const runPlayground = useCallback(
    async (path: PlaygroundPath) => {
      if (!token) return;
      setPlaygroundLoading(true);
      setFlashError("");
      setFlashSuccess("");
      setPlaygroundData(null);
      setPlaygroundKind(null);
      try {
        const monthly_income = Number(monthlyIncome);
        const monthly_spend = Number(monthlySpend);
        const tx_count = Math.round(Number(txCount));
        const volatility_hint = Number(volatilityHint);
        if (
          !Number.isFinite(monthly_income) ||
          !Number.isFinite(monthly_spend) ||
          !Number.isFinite(tx_count) ||
          !Number.isFinite(volatility_hint)
        ) {
          throw new Error("invalid_numbers");
        }
        const MAX_MONEY = 1e15;
        const MAX_TX = 1e9;
        if (
          Math.abs(monthly_income) > MAX_MONEY ||
          Math.abs(monthly_spend) > MAX_MONEY ||
          tx_count < 0 ||
          tx_count > MAX_TX
        ) {
          throw new Error("invalid_numbers");
        }
        const r = await fetch(`${API_BASE}/client/playground/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authz(token) },
          body: JSON.stringify({
            monthly_income,
            monthly_spend,
            tx_count,
            volatility_hint: Math.min(1, Math.max(0, volatility_hint)),
          }),
        });
        const data = (await r.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!r.ok) {
          const err =
            typeof data.error === "string" ? data.error : "Request failed";
          throw new Error(err);
        }
        setPlaygroundData(data);
        setPlaygroundKind(pathToInsightKind(path));
      } catch (e) {
        setFlashError(
          humanizeAuthError(e instanceof Error ? e.message : "playground_error"),
        );
      } finally {
        setPlaygroundLoading(false);
      }
    },
    [token, monthlyIncome, monthlySpend, txCount, volatilityHint],
  );

  useEffect(() => {
    if (!hasSession) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setFlashError("");
      try {
        const r = await fetch(`${API_BASE}/client/me`, {
          headers: { "Content-Type": "application/json", ...authz(token) },
        });
        if (cancelled) return;
        if (!r.ok) throw new Error("dashboard_load_failed");
        const data = (await r.json()) as ClientMeResponse;
        if (!cancelled) setMe(data);
      } catch (e) {
        if (!cancelled) {
          setFlashError(
            humanizeAuthError(
              e instanceof Error ? e.message : "dashboard_load_failed",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Session fetch must not block the logged-out login form if logout happens mid-request.
      setLoading(false);
    };
  }, [hasSession, token]);

  async function onSignup() {
    setLoading(true);
    setFlashError("");
    setFlashSuccess("");
    try {
      const companyName = sanitizeOrganizationName(signupCompany);
      const contactEmail = sanitizeEmailInput(signupEmail);
      const password = sanitizePasswordInput(signupPassword);
      if (!companyName) {
        throw new Error("missing_required_fields");
      }
      if (!isPlausibleEmail(contactEmail)) {
        throw new Error("missing_required_fields");
      }
      if (password.length < 8) {
        throw new Error("missing_required_fields");
      }
      const r = await fetch(`${API_BASE}/client/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactEmail,
          password,
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
        setFlashSuccess(
          `We sent a 6-digit code to ${sanitizeEmailInput(signupEmail)}. It expires in 10 minutes — enter it below to finish.`,
        );
        return;
      }
      throw new Error("OTP required but missing.");
    } catch (e) {
      setFlashSuccess("");
      setFlashError(
        humanizeAuthError(e instanceof Error ? e.message : "Signup error"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupOtp() {
    setLoading(true);
    setFlashError("");
    setFlashSuccess("");
    try {
      const pendingToken = sanitizePendingToken(pendingSignupToken);
      const otp = sanitizeOtpDigits(signupOtp, 6);
      if (!pendingToken || otp.length !== 6) {
        throw new Error("pending_token_and_otp_required");
      }
      const r = await fetch(`${API_BASE}/client/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          otp,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error
          ? String(body.error)
          : "OTP verification failed";
        throw new Error(msg);
      }
      const newToken = String(body?.token ?? "");
      const newKey = String(body?.apiKey ?? "");
      if (!newToken || !newKey)
        throw new Error("Missing token/apiKey after OTP verification.");

      setAwaitingOtp(false);
      setPendingSignupToken("");
      setSignupOtp("");
      setSignupSuccessToken(newToken);
      setSignupSuccessApiKey(newKey);
      setSignupSuccess(true);
    } catch (e) {
      setFlashError(
        humanizeAuthError(e instanceof Error ? e.message : "OTP error"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendSignupOtp() {
    setLoading(true);
    setFlashError("");
    try {
      const pendingToken = sanitizePendingToken(pendingSignupToken);
      if (!pendingToken) {
        throw new Error("pending_token_required");
      }
      const r = await fetch(`${API_BASE}/client/auth/otp/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Resend failed";
        throw new Error(msg);
      }
      setFlashSuccess(
        `We sent a new code to ${sanitizeEmailInput(signupEmail)}. It expires in 10 minutes.`,
      );
    } catch (e) {
      setFlashSuccess("");
      setFlashError(
        humanizeAuthError(e instanceof Error ? e.message : "Resend error"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onLogin() {
    setLoginSubmitting(true);
    setLoading(true);
    setFlashError("");
    setFlashSuccess("");
    setLoginSuccess(false);
    try {
      const email = sanitizeEmailInput(loginEmail);
      const password = sanitizePasswordInput(loginPassword);
      if (!isPlausibleEmail(email) || !password) {
        throw new Error("email_and_password_required");
      }
      const r = await fetch(`${API_BASE}/client/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error ? String(body.error) : "Login failed";
        throw new Error(msg);
      }
      const newToken = String(body?.token ?? "");
      const accountName = String(body?.account?.company_name ?? "").trim();

      if (!newToken) throw new Error("login_incomplete");

      setLoginSuccessToken(newToken);
      setLoginSuccessName(accountName);
      setLoginSuccess(true);
    } catch (e) {
      setFlashError(
        humanizeAuthError(e instanceof Error ? e.message : "Login error"),
      );
    } finally {
      setLoginSubmitting(false);
      setLoading(false);
    }
  }

  async function submitTransfer() {
    if (!token) return;
    setLoading(true);
    setFlashError("");
    setFlashSuccess("");
    try {
      const ref = sanitizeTransactionReference(transactionReference);
      if (!ref) {
        throw new Error("missing_required_fields");
      }
      const r = await fetch(`${API_BASE}/client/subscription/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authz(token) },
        body: JSON.stringify({
          planName: sanitizePlanNameInput(planName),
          cycle: sanitizeBillingCycle(cycle),
          amountDue: sanitizeUnsignedDecimalInput(amountDue, 16),
          payerName: sanitizePersonName(payerName),
          transactionReference: ref,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = body?.error
          ? String(body.error)
          : "Transfer request failed";
        throw new Error(msg);
      }
      // refresh
      const meR = await fetch(`${API_BASE}/client/me`, {
        headers: { ...authz(token) },
      });
      const data = (await meR.json()) as ClientMeResponse;
      setMe(data);
      setTransactionReference("");
      setFlashSuccess(
        "Thanks — we received your reference. We'll review it shortly.",
      );
    } catch (e) {
      setFlashError(
        humanizeAuthError(e instanceof Error ? e.message : "Transfer error"),
      );
    } finally {
      setLoading(false);
    }
  }

  function applyPlan(card: PlanCard) {
    setPlanName(sanitizePlanNameInput(card.name));
    setCycle(sanitizeBillingCycle(card.cycle));
    setAmountDue(String(card.amountNgn));
    setActiveNav("subscription");
    window.requestAnimationFrame(() => {
      const section = transferSectionRef.current;
      if (!section) return;
      const y = section.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      section.focus({ preventScroll: true });
    });
  }

  async function changePassword() {
    if (!token) return;
    setPwdSubmitting(true);
    setFlashError("");
    setFlashSuccess("");
    try {
      const r = await fetch(`${API_BASE}/client/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authz(token) },
        body: JSON.stringify({
          currentPassword: sanitizePasswordInput(pwdCurrent),
          newPassword: sanitizePasswordInput(pwdNew),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "password_change_failed",
        );
      }
      setFlashSuccess("Your password was updated.");
      setPwdCurrent("");
      setPwdNew("");
    } catch (e) {
      const key = e instanceof Error ? e.message : "";
      const map: Record<string, string> = {
        invalid_password_fields:
          "Enter your current password and a new password (at least 8 characters).",
        invalid_current_password: "That current password isn't correct.",
        password_change_failed: "We couldn't update your password. Try again.",
      };
      setFlashError(map[key] ?? humanizeApiSlug(key));
    } finally {
      setPwdSubmitting(false);
    }
  }

  async function cancelSubscription() {
    if (!token) return;
    const ok = window.confirm(
      "Cancel your subscription? Your API keys will be revoked and your account will be marked cancelled.",
    );
    if (!ok) return;
    setCancelSubmitting(true);
    setFlashError("");
    setFlashSuccess("");
    try {
      const r = await fetch(`${API_BASE}/client/subscription/cancel`, {
        method: "POST",
        headers: { ...authz(token) },
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "cancel_failed",
        );
      }
      setFlashSuccess("Your subscription is cancelled.");
      const meR = await fetch(`${API_BASE}/client/me`, {
        headers: { "Content-Type": "application/json", ...authz(token) },
      });
      if (meR.ok) setMe((await meR.json()) as ClientMeResponse);
    } catch (e) {
      const key = e instanceof Error ? e.message : "";
      const map: Record<string, string> = {
        subscription_not_cancellable: "There is no active subscription to cancel.",
        cancel_failed: "Could not cancel. Try again or contact support.",
      };
      setFlashError(map[key] ?? humanizeApiSlug(key));
    } finally {
      setCancelSubmitting(false);
    }
  }

  function onLogout() {
    setToken("");
    setMe(null);
    setFlashError("");
    setFlashSuccess("");
    setLoading(false);
    setLoginSubmitting(false);
    localStorage.removeItem(CREDRA_CLIENT_TOKEN_LS_KEY);
    // keep apiKey so they can copy/paste even after logout
  }

  const accountStatus = me?.account?.status ?? "—";
  const subscriptionStatus = me?.subscription?.status ?? "—";

  if (signupSuccess) {
    return (
      <SignupSuccess
        subtitle="Your account is ready. Opening your workspace."
        onDone={() => {
          setToken(signupSuccessToken);
          setApiKey(signupSuccessApiKey);
          localStorage.setItem(CREDRA_CLIENT_TOKEN_LS_KEY, signupSuccessToken);
          localStorage.setItem("credra_client_apiKey", signupSuccessApiKey);
          setSignupSuccess(false);
        }}
      />
    );
  }

  if (loginSuccess) {
    return (
      <SignupSuccess
        title={
          loginSuccessName
            ? `Welcome back, ${loginSuccessName}`
            : "Welcome back"
        }
        subtitle="Opening your workspace."
        onDone={() => {
          setToken(loginSuccessToken);
          localStorage.setItem(CREDRA_CLIENT_TOKEN_LS_KEY, loginSuccessToken);
          setLoginSuccess(false);
        }}
      />
    );
  }

  return (
    <main
      className={`${styles.page} ${hasSession ? styles.pageDash : styles.pageGate}`}
    >
      <FlashNotices
        error={flashError}
        success={flashSuccess}
        onDismissError={() => setFlashError("")}
        onDismissSuccess={() => setFlashSuccess("")}
      />
      <LoadingOverlay show={showLoadingOverlay} />
      <div className={styles.ambient} aria-hidden />
      <header className={hasSession ? styles.topBar : styles.centerTopBar}>
        <div
          className={hasSession ? styles.topBarBrand : styles.brandHeaderCenter}
        >
          <CredraLogo
            className={styles.brandLogo}
            height={hasSession ? 32 : 36}
          />
          <div
            className={hasSession ? styles.topBarTitleBlock : undefined}
          >
            <p className={styles.kicker}>Client workspace</p>
            <h1 className={styles.title}>CREDRA</h1>
            <p className={styles.subtitle}>
              {hasSession
                ? "Signals, billing, and live sandbox — without wiring your backend first."
                : "Sign in to manage your plan, connect accounts, and try the API."}
            </p>
          </div>
        </div>
        {hasSession ? (
          <button
            type="button"
            className={styles.topBarLogout}
            onClick={onLogout}
            disabled={loading}
          >
            Log out
          </button>
        ) : null}
      </header>

      {!hasSession ? (
        <div className={styles.centerStage}>
          <div className={styles.singleWrap}>
            {authMode === "login" ? (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Log in</h2>
                <div className={styles.field}>
                  <label>Email</label>
                  <input
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(sanitizeEmailInput(e.target.value))}
                    type="email"
                    autoComplete="username"
                    maxLength={254}
                  />
                </div>
                <div className={styles.field}>
                  <label>Password</label>
                  <input
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(sanitizePasswordInput(e.target.value))}
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                  />
                </div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void onLogin()}
                  disabled={loginSubmitting || loading}
                  aria-busy={loginSubmitting}
                >
                  Log in
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
                    onChange={(e) =>
                      setSignupCompany(sanitizeOrganizationName(e.target.value))
                    }
                    disabled={loading || awaitingOtp}
                    maxLength={120}
                    autoComplete="organization"
                  />
                </div>
                <div className={styles.field}>
                  <label>Contact email</label>
                  <input
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(sanitizeEmailInput(e.target.value))}
                    type="email"
                    autoComplete="email"
                    disabled={loading || awaitingOtp}
                    maxLength={254}
                  />
                </div>
                <div className={styles.field}>
                  <label>Password</label>
                  <input
                    value={signupPassword}
                    onChange={(e) =>
                      setSignupPassword(sanitizePasswordInput(e.target.value))
                    }
                    type="password"
                    autoComplete="new-password"
                    disabled={loading || awaitingOtp}
                    maxLength={128}
                  />
                </div>
                {awaitingOtp ? (
                  <>
                    <p className={styles.muted}>
                      Enter the 6-digit code from your email. It expires in 10
                      minutes.
                    </p>
                    <div className={styles.field}>
                      <label>Verification code</label>
                      <input
                        value={signupOtp}
                        onChange={(e) =>
                          setSignupOtp(sanitizeOtpDigits(e.target.value, 6))
                        }
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={6}
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={verifySignupOtp}
                      disabled={loading || signupOtp.length !== 6}
                    >
                      Verify code
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
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={onSignup}
                    disabled={loading}
                  >
                    Create account
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
        <div className={styles.dashShell}>
          <aside className={styles.sideNav} aria-label="Workspace sections">
            <div className={styles.sideNavKicker}>Navigate</div>
            {CLIENT_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.sideNavBtn} ${activeNav === item.id ? styles.sideNavBtnActive : ""}`}
                onClick={() => setActiveNav(item.id)}
                aria-current={activeNav === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <div className={styles.dashMain}>
            {activeNav === "dashboard" ? (
              <>
                <section className={styles.heroCard}>
                  <div className={styles.heroCardInner}>
                    <div>
                      <h2 className={styles.dashTitle}>
                        {me?.account?.company_name ?? "Your workspace"}
                      </h2>
                      <p className={styles.dashLead}>
                        Credit signals and fraud checks — test in Credra AI,
                        then promote the same API to production.
                      </p>
                    </div>
                    <div className={styles.heroMeta}>
                      <span className={styles.pill}>{accountStatus}</span>
                      <span className={styles.pill}>{subscriptionStatus}</span>
                    </div>
                  </div>
                </section>

                <div className={styles.kvWide}>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Account</div>
                    <div className={styles.kvValue}>{accountStatus}</div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Subscription</div>
                    <div className={styles.kvValue}>{subscriptionStatus}</div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Plan</div>
                    <div className={styles.kvValue}>
                      {me?.account?.plan_name ?? "—"}
                    </div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Billing cycle</div>
                    <div className={styles.kvValue}>
                      {me?.account?.cycle ?? "—"}
                    </div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>API calls (30d)</div>
                    <div className={styles.kvValue}>
                      {me?.stats?.api_calls_30d ?? "—"}
                    </div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Member since</div>
                    <div className={styles.kvValue}>
                      {formatDateLabel(me?.account?.created_at)}
                    </div>
                  </div>
                  <div className={styles.kvItem}>
                    <div className={styles.kvLabel}>Bank link (Mono)</div>
                    <div className={styles.kvValue}>
                      {monoAccountId ? "Linked" : "Not linked"}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {activeNav === "credra-ai" ? (
              <>
                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h3 className={styles.subTitle}>Live sandbox</h3>
                    <p className={styles.muted}>
                      Run the same models as production using your dashboard
                      session — no API key required. Adjust cashflow features,
                      then run credit score, fraud check, or risk analysis.
                      Results are shown as charts and plain-language guidance,
                      not raw JSON.
                    </p>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Monthly income</label>
                      <input
                        inputMode="decimal"
                        value={monthlyIncome}
                        onChange={(e) =>
                          setMonthlyIncome(sanitizeSignedDecimalInput(e.target.value))
                        }
                        maxLength={24}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Monthly spend</label>
                      <input
                        inputMode="decimal"
                        value={monthlySpend}
                        onChange={(e) =>
                          setMonthlySpend(sanitizeSignedDecimalInput(e.target.value))
                        }
                        maxLength={24}
                      />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Transaction count (window)</label>
                      <input
                        inputMode="numeric"
                        value={txCount}
                        onChange={(e) =>
                          setTxCount(sanitizePositiveIntegerString(e.target.value))
                        }
                        maxLength={10}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Volatility hint (0–1)</label>
                      <input
                        inputMode="decimal"
                        value={volatilityHint}
                        onChange={(e) =>
                          setVolatilityHint(sanitizeVolatilityHintInput(e.target.value))
                        }
                        maxLength={8}
                      />
                    </div>
                  </div>
                  <div className={styles.playRow}>
                    <button
                      type="button"
                      className={styles.accentBtn}
                      onClick={() => void runPlayground("score")}
                      disabled={playgroundLoading}
                    >
                      Credit score
                    </button>
                    <button
                      type="button"
                      className={styles.accentBtn}
                      onClick={() => void runPlayground("fraud-check")}
                      disabled={playgroundLoading}
                    >
                      Fraud check
                    </button>
                    <button
                      type="button"
                      className={styles.accentBtn}
                      onClick={() => void runPlayground("risk-analysis")}
                      disabled={playgroundLoading}
                    >
                      Risk analysis
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => {
                        setMonthlyIncome("4500");
                        setMonthlySpend("3800");
                        setTxCount("42");
                        setVolatilityHint("0.25");
                      }}
                      disabled={playgroundLoading}
                    >
                      Sample inputs
                    </button>
                  </div>
                  {playgroundData && playgroundKind ? (
                    <ClientAiInsight
                      kind={playgroundKind}
                      data={playgroundData}
                    />
                  ) : null}
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h3 className={styles.subTitle}>Connect a bank (Mono)</h3>
                    <p className={styles.muted}>
                      Link an account the same way production flows will —
                      OAuth-style handoff to Mono, then balance and transactions
                      on demand.
                    </p>
                  </div>
                  <div className={styles.playRow}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void openMonoConnect()}
                    >
                      Connect bank account
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => void fetchMonoBalance()}
                      disabled={!monoAccountId}
                    >
                      Fetch balance
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => void fetchMonoTransactions()}
                      disabled={!monoAccountId}
                    >
                      Fetch transactions
                    </button>
                  </div>
                  <div className={styles.monoMeta}>
                    <div>
                      <div className={styles.kvLabel}>Auth code</div>
                      <div className={styles.monoVal}>{monoCode || "—"}</div>
                    </div>
                    <div>
                      <div className={styles.kvLabel}>Mono account id</div>
                      <div className={styles.monoVal}>
                        {monoAccountId || "—"}
                      </div>
                    </div>
                  </div>
                  {monoExchange ? (
                    <details className={styles.details}>
                      <summary>Connection result</summary>
                      <MonoExchangeSummary payload={monoExchange} />
                    </details>
                  ) : null}
                  {monoBalance ? (
                    (() => {
                      const data =
                        (monoBalance.data as Record<string, unknown> | undefined) ??
                        monoBalance;
                      const available = pickFirstNumber(data, [
                        "available_balance",
                        "available",
                        "availableBalance",
                      ]);
                      const ledger = pickFirstNumber(data, [
                        "ledger_balance",
                        "current_balance",
                        "balance",
                        "ledger",
                      ]);
                      const currency = pickFirstString(data, ["currency", "currency_code"]);
                      const account = pickFirstString(data, [
                        "account_name",
                        "name",
                        "accountName",
                      ]);

                      return (
                        <section className={styles.aiInsight} aria-label="Balance overview">
                          <div className={styles.aiInsightHeader}>
                            <span className={styles.aiInsightKicker}>Balance</span>
                            <span className={`${styles.aiBand} ${styles.aiBandLow}`}>
                              Linked
                            </span>
                          </div>
                          <p className={styles.aiHeadline}>
                            Latest account balance snapshot from your linked bank account.
                          </p>
                          <div className={styles.kvWide}>
                            <div className={styles.kvItem}>
                              <div className={styles.kvLabel}>Available balance</div>
                              <div className={styles.kvValue}>{formatNgnCompact(available)}</div>
                            </div>
                            <div className={styles.kvItem}>
                              <div className={styles.kvLabel}>Ledger/current balance</div>
                              <div className={styles.kvValue}>{formatNgnCompact(ledger)}</div>
                            </div>
                            <div className={styles.kvItem}>
                              <div className={styles.kvLabel}>Currency</div>
                              <div className={styles.kvValue}>{currency}</div>
                            </div>
                            <div className={styles.kvItem}>
                              <div className={styles.kvLabel}>Account name</div>
                              <div className={styles.kvValue}>{account}</div>
                            </div>
                          </div>
                        </section>
                      );
                    })()
                  ) : null}
                  {monoTransactions.length ? (
                    <section className={styles.aiInsight} aria-label="Transaction summary">
                      <div className={styles.aiInsightHeader}>
                        <span className={styles.aiInsightKicker}>Transactions</span>
                        <span className={`${styles.aiBand} ${styles.aiBandMid}`}>
                          {monoTransactions.length} records
                        </span>
                      </div>
                      <p className={styles.aiHeadline}>
                        Recent activity from your linked account, formatted for quick review.
                      </p>
                      <div className={styles.kvWide}>
                        <div className={styles.kvItem}>
                          <div className={styles.kvLabel}>Recent window</div>
                          <div className={styles.kvValue}>Last {monoTransactions.length}</div>
                        </div>
                        <div className={styles.kvItem}>
                          <div className={styles.kvLabel}>Debits</div>
                          <div className={styles.kvValue}>
                            {
                              monoTransactions.filter((tx) => {
                                const amount = pickFirstNumber(tx, ["amount", "value"]);
                                return amount !== null && amount < 0;
                              }).length
                            }
                          </div>
                        </div>
                        <div className={styles.kvItem}>
                          <div className={styles.kvLabel}>Credits</div>
                          <div className={styles.kvValue}>
                            {
                              monoTransactions.filter((tx) => {
                                const amount = pickFirstNumber(tx, ["amount", "value"]);
                                return amount !== null && amount > 0;
                              }).length
                            }
                          </div>
                        </div>
                      </div>
                      <div className={styles.aiBlock}>
                        <div className={styles.aiBlockTitle}>Latest transactions</div>
                        <div className={styles.kvWide}>
                          {monoTransactions.slice(0, 6).map((tx, idx) => {
                            const amount = pickFirstNumber(tx, ["amount", "value"]);
                            const narration = pickFirstString(tx, [
                              "narration",
                              "description",
                              "remark",
                            ]);
                            const type = pickFirstString(tx, ["type", "transaction_type"]);
                            const whenRaw = pickFirstString(tx, [
                              "date",
                              "transaction_date",
                              "created_at",
                            ]);
                            const when =
                              whenRaw !== "—" ? formatDateLabel(whenRaw) : "—";
                            return (
                              <div key={`${idx}-${whenRaw}`} className={styles.kvItem}>
                                <div className={styles.kvLabel}>
                                  {type !== "—" ? type : "Transaction"} · {when}
                                </div>
                                <div className={styles.kvValue}>{formatNgnCompact(amount)}</div>
                                <p className={styles.aiMutedSmall}>{narration}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  ) : null}
                </section>
              </>
            ) : null}

            {activeNav === "subscription" ? (
              <>
                <section className={styles.panel}>
                  <h3 className={styles.sectionTitle}>Plans</h3>
                  <p className={styles.sectionLead}>
                    Choose a plan that matches your runway. Prices are in
                    Nigerian Naira. Use &quot;Use this plan&quot; to pre-fill
                    the bank transfer form below.
                  </p>
                  <div className={styles.planGrid}>
                    {PLAN_CARDS.map((card) => (
                      <div
                        key={card.id}
                        className={`${styles.planCard} ${card.id === "pro" ? styles.planCardHighlight : ""}`}
                      >
                        <h4 className={styles.planCardName}>{card.name}</h4>
                        <p className={styles.planCardBlurb}>{card.blurb}</p>
                        <div>
                          <div className={styles.planCardPrice}>
                            {formatNgn(card.amountNgn)}
                          </div>
                          <div className={styles.planCardCycle}>
                            per {card.durationLabel} · {card.cycle}
                          </div>
                        </div>
                        <ul className={styles.planCardList}>
                          {card.features.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className={styles.planCardBtn}
                          onClick={() => applyPlan(card)}
                        >
                          Use this plan
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  ref={transferSectionRef}
                  className={styles.panel}
                  tabIndex={-1}
                  aria-label="Pay via bank transfer"
                >
                  <h3 className={styles.subTitle}>Pay via bank transfer</h3>
                  <p className={styles.muted}>
                    Send payment to the receiving details below, then submit your
                    transaction reference for admin approval.
                  </p>
                  <div className={styles.bankBox}>
                    <div>
                      <div className={styles.bankLabel}>Bank</div>
                      <div className={styles.bankValue}>
                        {me?.billing.bank ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className={styles.bankLabel}>Account number</div>
                      <div className={styles.bankValue}>
                        {me?.billing.accountNumber ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className={styles.bankLabel}>Account name</div>
                      <div className={styles.bankValue}>
                        {me?.billing.accountName ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Plan name</label>
                      <input
                        value={planName}
                        onChange={(e) =>
                          setPlanName(sanitizePlanNameInput(e.target.value))
                        }
                        maxLength={64}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Cycle</label>
                      <select
                        value={cycle}
                        onChange={(e) =>
                          setCycle(sanitizeBillingCycle(e.target.value))
                        }
                      >
                        <option value="weekly">weekly</option>
                        <option value="monthly">monthly</option>
                        <option value="yearly">yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Amount due</label>
                      <input
                        value={amountDue}
                        onChange={(e) =>
                          setAmountDue(sanitizeUnsignedDecimalInput(e.target.value))
                        }
                        maxLength={16}
                        inputMode="decimal"
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Payer name</label>
                      <input
                        value={payerName}
                        onChange={(e) =>
                          setPayerName(sanitizePersonName(e.target.value))
                        }
                        maxLength={120}
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label>Transaction reference</label>
                    <input
                      value={transactionReference}
                      onChange={(e) =>
                        setTransactionReference(
                          sanitizeTransactionReference(e.target.value),
                        )
                      }
                      placeholder="e.g. TRX/xxxxxxxx"
                      maxLength={120}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={submitTransfer}
                    disabled={
                      loading || !sanitizeTransactionReference(transactionReference)
                    }
                  >
                    Submit transfer reference
                  </button>

                  {me?.latestTransfer ? (
                    <p className={styles.note}>
                      Latest transfer:{" "}
                      <strong>{me.latestTransfer.transaction_reference}</strong>{" "}
                      ({me.latestTransfer.status}) for{" "}
                      {me.latestTransfer.amount}
                    </p>
                  ) : null}
                </section>
              </>
            ) : null}

            {activeNav === "api-key" ? (
              <section className={styles.panel}>
                <h3 className={styles.subTitle}>Production API key</h3>
                <p className={styles.muted}>
                  After your transfer is approved, use this key in
                  server-to-server calls (Bearer token).
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
                  Endpoints:{" "}
                  <span className={styles.mono}>
                    POST /api/v1/client/credit-score
                  </span>
                  ,{" "}
                  <span className={styles.mono}>
                    POST /api/v1/client/fraud-check
                  </span>
                  ,{" "}
                  <span className={styles.mono}>
                    POST /api/v1/client/risk-analysis
                  </span>
                </p>
              </section>
            ) : null}

            {activeNav === "settings" ? (
              <section className={styles.panel}>
                <h3 className={styles.subTitle}>Password</h3>
                <p className={styles.muted}>
                  Use a strong password you do not reuse elsewhere.
                </p>
                <div className={styles.field}>
                  <label>Current password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={pwdCurrent}
                    onChange={(e) =>
                      setPwdCurrent(sanitizePasswordInput(e.target.value))
                    }
                    maxLength={128}
                  />
                </div>
                <div className={styles.field}>
                  <label>New password (min 8 characters)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(sanitizePasswordInput(e.target.value))}
                    maxLength={128}
                  />
                </div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void changePassword()}
                  disabled={
                    pwdSubmitting || !pwdCurrent.trim() || pwdNew.length < 8
                  }
                >
                  Update password
                </button>

                <div className={styles.dangerZone}>
                  <h4 className={styles.dangerTitle}>Cancel subscription</h4>
                  <p className={styles.dangerLead}>
                    This revokes API keys and marks your account as cancelled.
                    You can sign up again later if needed.
                  </p>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => void cancelSubscription()}
                    disabled={cancelSubmitting}
                  >
                    Cancel subscription
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
