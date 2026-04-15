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

function addCycleDurationLocal(startedAt: Date, cycle: string): Date {
  const d = new Date(startedAt.getTime());
  const c = cycle.trim().toLowerCase();
  if (c === "weekly") d.setDate(d.getDate() + 7);
  else if (c === "monthly") d.setMonth(d.getMonth() + 1);
  else if (c === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function formatCountdownMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
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
    api_quota: number;
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
    api_calls_used: number;
    api_calls_quota: number;
    api_calls_remaining: number;
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
    invalid_plan: "That plan selection isn't valid. Please try again.",
    invalid_plan_cycle: "That plan doesn't match the billing period. Please try again.",
    enterprise_subscription_required:
      "An Enterprise plan is required to extend API usage.",
    extension_already_in_progress:
      "You already have an extension request pending approval. Please wait.",
    extension_request_failed: "We couldn't submit your extension request. Try again.",
    api_not_included: "Your current plan doesn't include production API access.",
    api_quota_exceeded:
      "You've reached your production API call limit. Extend usage or upgrade.",
    transaction_reference_already_used:
      "That payment reference was already used. Enter a new bank reference.",
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
  type FlashScope =
    | "gate"
    | "dashboard"
    | "playground"
    | "mono"
    | "subscription"
    | "api-key"
    | "settings";
  const [flashScope, setFlashScope] = useState<FlashScope>("gate");

  const flash = useCallback(
    (next: { scope: FlashScope; error?: string; success?: string }) => {
      setFlashScope(next.scope);
      setFlashError(next.error ?? "");
      setFlashSuccess(next.success ?? "");
    },
    [],
  );

  const clearFlash = useCallback(() => {
    setFlashError("");
    setFlashSuccess("");
  }, []);

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
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [enterpriseExtendReference, setEnterpriseExtendReference] =
    useState("");
  const [enterpriseExtendSubmitting, setEnterpriseExtendSubmitting] =
    useState(false);
  const [redirectToSubscriptionAfterSignup, setRedirectToSubscriptionAfterSignup] =
    useState(false);

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

  useEffect(() => {
    if (token) return; // already logged in / local session present
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const planFromUrl = params.get("plan");
    if (mode !== "signup") return;
    if (!planFromUrl) return;

    const v = planFromUrl.trim().toLowerCase();
    const planCard = PLAN_CARDS.find((c) => c.name.toLowerCase() === v);
    if (!planCard) return;

    // Avoid overwriting user input if they already started signup.
    if (authMode !== "signup") setAuthMode("signup");
    setPlanName(planCard.name);
    setCycle(planCard.cycle);
    setAmountDue(String(planCard.amountNgn));
    setRedirectToSubscriptionAfterSignup(true);
  }, [token, authMode]);

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

  useEffect(() => {
    if (!me?.subscription?.started_at) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [me?.subscription?.started_at]);

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
    flash({ scope: "mono", error: "", success: "" });
    setMonoBalance(null);
    setMonoTransactions([]);

    if (!MONO_PUBLIC_KEY) {
      flash({
        scope: "mono",
        error: humanizeMonoForUser("missing public key", "connect"),
        success: "",
      });
      return;
    }

    if (!monoRef.current) {
      monoRef.current = new Connect({
        key: MONO_PUBLIC_KEY,
        onSuccess: async (payload: { code?: string }) => {
          const code = sanitizeMonoAuthCode(String(payload?.code ?? ""));
          if (!code) {
            flash({
              scope: "mono",
              error: humanizeMonoForUser("no auth code", "connect"),
              success: "",
            });
            return;
          }
          setMonoCode(code);
          try {
            await exchangeMonoCodeForAccount(code);
            flash({
              scope: "mono",
              error: "",
              success: "Bank linked successfully.",
            });
          } catch (e) {
            flash({
              scope: "mono",
              error: humanizeMonoForUser(
                e instanceof Error ? e.message : "exchange failed",
                "connect",
              ),
              success: "",
            });
          }
        },
        onClose: () => {
          /* user closed widget */
        },
      });
      monoRef.current.setup();
    }

    monoRef.current.open();
  }, [exchangeMonoCodeForAccount, flash]);

  const fetchMonoBalance = useCallback(async () => {
    flash({ scope: "mono", error: "", success: "" });
    setMonoBalance(null);
    if (!monoAccountId) {
      flash({
        scope: "mono",
        error: humanizeMonoForUser("connect first", "balance"),
        success: "",
      });
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
      flash({
        scope: "mono",
        error: humanizeMonoForUser(msg, "balance"),
        success: "",
      });
      return;
    }
    setMonoBalance(body ?? {});
    flash({ scope: "mono", error: "", success: "Balance updated." });
  }, [monoAccountId, flash]);

  const fetchMonoTransactions = useCallback(async () => {
    flash({ scope: "mono", error: "", success: "" });
    setMonoTransactions([]);
    if (!monoAccountId) {
      flash({
        scope: "mono",
        error: humanizeMonoForUser("connect first", "transactions"),
        success: "",
      });
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
      flash({
        scope: "mono",
        error: humanizeMonoForUser(msg, "transactions"),
        success: "",
      });
      return;
    }
    const arr = (body?.data as unknown) ?? [];
    setMonoTransactions(
      Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [],
    );
    flash({ scope: "mono", error: "", success: "Transactions loaded." });
  }, [monoAccountId, flash]);

  const runPlayground = useCallback(
    async (path: PlaygroundPath) => {
      if (!token) return;
      setPlaygroundLoading(true);
      flash({ scope: "playground", error: "", success: "" });
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
        flash({
          scope: "playground",
          error: humanizeAuthError(
            e instanceof Error ? e.message : "playground_error",
          ),
          success: "",
        });
      } finally {
        setPlaygroundLoading(false);
      }
    },
    [token, monthlyIncome, monthlySpend, txCount, volatilityHint, flash],
  );

  useEffect(() => {
    if (!hasSession) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      flash({ scope: "dashboard", error: "", success: "" });
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
          flash({
            scope: "dashboard",
            error: humanizeAuthError(
              e instanceof Error ? e.message : "dashboard_load_failed",
            ),
            success: "",
          });
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
  }, [hasSession, token, flash]);

  // Poll /client/me periodically so backend opportunistic reminder emails trigger
  // even if the user stays on the page.
  useEffect(() => {
    if (!hasSession) return;
    if (!me?.subscription?.started_at) return;

    const id = window.setInterval(() => {
      void (async () => {
        try {
          const meR = await fetch(`${API_BASE}/client/me`, {
            headers: { ...authz(token) },
          });
          if (!meR.ok) return;
          const data = (await meR.json()) as ClientMeResponse;
          setMe(data);
        } catch {
          // ignore background polling errors
        }
      })();
    }, 30 * 60 * 1000);

    return () => window.clearInterval(id);
  }, [hasSession, token, me?.subscription?.started_at]);

  async function onSignup() {
    setLoading(true);
    flash({ scope: "gate", error: "", success: "" });
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
        flash({
          scope: "gate",
          success: `We sent a 6-digit code to ${sanitizeEmailInput(signupEmail)}. It expires in 10 minutes — enter it below to finish.`,
          error: "",
        });
        return;
      }
      throw new Error("OTP required but missing.");
    } catch (e) {
      flash({
        scope: "gate",
        success: "",
        error: humanizeAuthError(e instanceof Error ? e.message : "Signup error"),
      });
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupOtp() {
    setLoading(true);
    flash({ scope: "gate", error: "", success: "" });
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
      flash({
        scope: "gate",
        error: humanizeAuthError(e instanceof Error ? e.message : "OTP error"),
        success: "",
      });
    } finally {
      setLoading(false);
    }
  }

  async function resendSignupOtp() {
    setLoading(true);
    flash({ scope: "gate", error: "", success: "" });
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
      flash({
        scope: "gate",
        success: `We sent a new code to ${sanitizeEmailInput(signupEmail)}. It expires in 10 minutes.`,
        error: "",
      });
    } catch (e) {
      flash({
        scope: "gate",
        success: "",
        error: humanizeAuthError(e instanceof Error ? e.message : "Resend error"),
      });
    } finally {
      setLoading(false);
    }
  }

  async function onLogin() {
    setLoginSubmitting(true);
    setLoading(true);
    flash({ scope: "gate", error: "", success: "" });
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
      flash({
        scope: "gate",
        error: humanizeAuthError(e instanceof Error ? e.message : "Login error"),
        success: "",
      });
    } finally {
      setLoginSubmitting(false);
      setLoading(false);
    }
  }

  async function submitTransfer() {
    if (!token) return;
    setLoading(true);
    flash({ scope: "subscription", error: "", success: "" });
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
      const notified = body?.adminNotified !== false;
      if (notified) {
        flash({
          scope: "subscription",
          success:
            "Thanks — we received your reference and sent an approval email to the admin.",
          error: "",
        });
      } else {
        flash({
          scope: "subscription",
          success:
            "Thanks — we received your reference, but admin email notification failed. Please contact support/admin.",
          error: "",
        });
      }
    } catch (e) {
      flash({
        scope: "subscription",
        error: humanizeAuthError(
          e instanceof Error ? e.message : "Transfer error",
        ),
        success: "",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitApiExtension() {
    if (!token) return;
    if (!enterpriseExtendReference.trim()) return;
    setEnterpriseExtendSubmitting(true);
    flash({ scope: "api-key", error: "", success: "" });
    try {
      const ref = sanitizeTransactionReference(enterpriseExtendReference);
      if (!ref) throw new Error("missing_required_fields");

      const r = await fetch(`${API_BASE}/client/api/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authz(token) },
        body: JSON.stringify({
          payerName: sanitizePersonName(payerName),
          transactionReference: ref,
        }),
      });

      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg =
          typeof body?.error === "string" ? body.error : "extension_request_failed";
        throw new Error(msg);
      }

      // refresh dashboard data (quota will update after admin approves)
      const meR = await fetch(`${API_BASE}/client/me`, {
        headers: { ...authz(token) },
      });
      if (meR.ok) {
        const data = (await meR.json()) as ClientMeResponse;
        setMe(data);
      }

      setEnterpriseExtendReference("");
      if (body?.adminNotified === false) {
        flash({
          scope: "api-key",
          success:
            "Extension request submitted, but admin email notification failed. Please contact support/admin.",
          error: "",
        });
      } else {
        flash({
          scope: "api-key",
          success:
            "Extension request submitted and admin was notified by email.",
          error: "",
        });
      }
    } catch (e) {
      flash({
        scope: "api-key",
        error: humanizeAuthError(
          e instanceof Error ? e.message : "Extension error",
        ),
        success: "",
      });
    } finally {
      setEnterpriseExtendSubmitting(false);
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
    flash({ scope: "settings", error: "", success: "" });
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
      flash({
        scope: "settings",
        success: "Your password was updated.",
        error: "",
      });
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
      flash({
        scope: "settings",
        error: map[key] ?? humanizeApiSlug(key),
        success: "",
      });
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
    flash({ scope: "settings", error: "", success: "" });
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
      flash({
        scope: "settings",
        success: "Your subscription is cancelled.",
        error: "",
      });
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
      flash({
        scope: "settings",
        error: map[key] ?? humanizeApiSlug(key),
        success: "",
      });
    } finally {
      setCancelSubmitting(false);
    }
  }

  function onLogout() {
    setToken("");
    setMe(null);
    clearFlash();
    setLoading(false);
    setLoginSubmitting(false);
    localStorage.removeItem(CREDRA_CLIENT_TOKEN_LS_KEY);
    // keep apiKey so they can copy/paste even after logout
  }

  const accountStatus = me?.account?.status ?? "—";
  const subscriptionStatus = me?.subscription?.status ?? "—";

  const planExpiry = useMemo(() => {
    const startedAtISO = me?.subscription?.started_at;
    const cycle = me?.subscription?.cycle;
    if (!startedAtISO || !cycle) return null;
    const startedAt = new Date(startedAtISO);
    if (Number.isNaN(startedAt.getTime())) return null;
    return addCycleDurationLocal(startedAt, cycle);
  }, [me?.subscription?.started_at, me?.subscription?.cycle]);

  const planRemainingLabel = planExpiry
    ? formatCountdownMs(planExpiry.getTime() - nowMs)
    : "—";

  const planRemainingMs = planExpiry ? planExpiry.getTime() - nowMs : null;
  const isReminderWindow =
    planRemainingMs != null && planRemainingMs > 0 && planRemainingMs <= 2 * 86400000;
  const isPlanExpired = planRemainingMs != null && planRemainingMs <= 0;

  const showApiKeyTab =
    me?.subscription?.status === "active" && me?.account?.plan_name !== "Starter";

  const apiCallsUsed = me?.stats?.api_calls_used ?? 0;
  const apiCallsQuota = me?.stats?.api_calls_quota ?? 0;
  const apiCallsRemaining = me?.stats?.api_calls_remaining ?? 0;
  const isProPlan = me?.account?.plan_name === "Pro";
  const isEnterprisePlan = me?.account?.plan_name === "Enterprise";

  const enterpriseExtensionFee = useMemo(() => {
    const annual = Number(me?.subscription?.amount_due ?? "");
    if (!Number.isFinite(annual) || annual <= 0) return null;
    return Math.round(annual * 0.1 * 100) / 100; // keep 2 decimals
  }, [me?.subscription?.amount_due]);

  const navItems = useMemo(
    () =>
      CLIENT_NAV.filter((item) => {
        if (item.id !== "api-key") return true;
        return Boolean(showApiKeyTab);
      }),
    [showApiKeyTab],
  );

  useEffect(() => {
    if (!hasSession) return;
    if (!navItems.some((i) => i.id === activeNav)) setActiveNav("dashboard");
  }, [hasSession, navItems, activeNav]);

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
          if (redirectToSubscriptionAfterSignup) {
            setActiveNav("subscription");
            setRedirectToSubscriptionAfterSignup(false);
          }
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
                {flashScope === "gate" && authMode === "login" ? (
                  <FlashNotices
                    variant="inline"
                    error={flashError}
                    success={flashSuccess}
                    onDismissError={clearFlash}
                    onDismissSuccess={clearFlash}
                  />
                ) : null}
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
                {flashScope === "gate" && authMode === "signup" ? (
                  <FlashNotices
                    variant="inline"
                    error={flashError}
                    success={flashSuccess}
                    onDismissError={clearFlash}
                    onDismissSuccess={clearFlash}
                  />
                ) : null}
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
            {navItems.map((item) => (
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
                {flashScope === "dashboard" ? (
                  <FlashNotices
                    variant="inline"
                    error={flashError}
                    success={flashSuccess}
                    onDismissError={clearFlash}
                    onDismissSuccess={clearFlash}
                  />
                ) : null}
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
                  {me?.subscription?.started_at ? (
                    <div className={styles.kvItem}>
                      <div className={styles.kvLabel}>Plan expires in</div>
                      <div className={styles.kvValue}>{planRemainingLabel}</div>
                    </div>
                  ) : null}
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
                  {flashScope === "playground" ? (
                    <FlashNotices
                      variant="inline"
                      error={flashError}
                      success={flashSuccess}
                      onDismissError={clearFlash}
                      onDismissSuccess={clearFlash}
                    />
                  ) : null}
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
                  {flashScope === "mono" ? (
                    <FlashNotices
                      variant="inline"
                      error={flashError}
                      success={flashSuccess}
                      onDismissError={clearFlash}
                      onDismissSuccess={clearFlash}
                    />
                  ) : null}
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

                {me?.subscription?.started_at ? (
                  <p className={styles.note}>
                    Plan countdown: <strong>{planRemainingLabel}</strong>{" "}
                    {planExpiry ? (
                      <>
                        (expires {formatDateLabel(planExpiry.toISOString())})
                      </>
                    ) : null}
                    {isReminderWindow ? (
                      <>
                        {" "}
                        — reminder email will be sent soon.
                      </>
                    ) : null}
                  </p>
                ) : null}
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
                          disabled={
                            me?.subscription?.status === "active" &&
                            !isPlanExpired &&
                            me?.account?.plan_name === card.name
                          }
                          onClick={() => {
                            const isSubscribed =
                              me?.subscription?.status === "active" &&
                              !isPlanExpired &&
                              me?.account?.plan_name === card.name;
                            if (isSubscribed) return;
                            applyPlan(card);
                          }}
                        >
                          {me?.subscription?.status === "active" &&
                          me?.account?.plan_name === card.name ? (
                            isPlanExpired ? (
                              "Resubscribe"
                            ) : (
                              "Subscribed"
                            )
                          ) : (
                            "Use this plan"
                          )}
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

                  {flashScope === "subscription" ? (
                    <FlashNotices
                      variant="inline"
                      error={flashError}
                      success={flashSuccess}
                      onDismissError={clearFlash}
                      onDismissSuccess={clearFlash}
                    />
                  ) : null}

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
                    disabled={!apiKey}
                  >
                    Copy
                  </button>
                </div>
                {flashScope === "api-key" ? (
                  <FlashNotices
                    variant="inline"
                    error={flashError}
                    success={flashSuccess}
                    onDismissError={clearFlash}
                    onDismissSuccess={clearFlash}
                  />
                ) : null}
                {isProPlan ? (
                  <p className={styles.note}>
                    Pro API limit: <strong>{apiCallsQuota}</strong> calls per
                    period. Used {apiCallsUsed}. Remaining{" "}
                    <strong>{apiCallsRemaining}</strong>.
                  </p>
                ) : null}

                {isEnterprisePlan ? (
                  <>
                    <p className={styles.note}>
                      Enterprise API limit: <strong>{apiCallsQuota}</strong>{" "}
                      calls per year. Used {apiCallsUsed}. Remaining{" "}
                      <strong>{apiCallsRemaining}</strong>.
                    </p>
                    <div className={styles.field}>
                      <label>Extend API usage (transaction reference)</label>
                      <input
                        value={enterpriseExtendReference}
                        onChange={(e) =>
                          setEnterpriseExtendReference(
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
                      onClick={() => void submitApiExtension()}
                      disabled={
                        enterpriseExtendSubmitting ||
                        !sanitizeTransactionReference(enterpriseExtendReference)
                      }
                    >
                      Submit extension reference
                    </button>
                    {enterpriseExtensionFee != null ? (
                      <p className={styles.muted} style={{ marginTop: "0.5rem" }}>
                        Each extension adds +100 calls/year for +10% of your
                        annual plan price ({formatNgn(enterpriseExtensionFee)}).
                      </p>
                    ) : null}
                  </>
                ) : null}

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
                {flashScope === "settings" ? (
                  <FlashNotices
                    variant="inline"
                    error={flashError}
                    success={flashSuccess}
                    onDismissError={clearFlash}
                    onDismissSuccess={clearFlash}
                  />
                ) : null}
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
