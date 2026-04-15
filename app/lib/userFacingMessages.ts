/** Map API / internal errors to plain language for end users (no URLs, codes, or dev commands). */

export function humanizeNetworkFailure(): string {
  return "We couldn't reach our servers. Check your internet connection, wait a moment, and try again.";
}

const ADMIN_SNIPPETS: Array<{ test: (s: string) => boolean; msg: string }> = [
  {
    test: (s) => /invalid.*credential|wrong password|unauthorized/i.test(s),
    msg: "That email or password doesn't match our records.",
  },
  {
    test: (s) => /totp|authenticator|2fa|two-?factor/i.test(s) && /invalid|wrong|fail/i.test(s),
    msg: "That security code doesn't look right. Try again.",
  },
  {
    test: (s) => /no session|token|sign-?in didn't/i.test(s),
    msg: "Sign-in didn't finish. Please try again.",
  },
  {
    test: (s) => /panel|dashboard|fetch admin/i.test(s),
    msg: "We couldn't load your dashboard. Refresh the page or try again in a moment.",
  },
  {
    test: (s) => /download/i.test(s),
    msg: "We couldn't download that file. Please try again.",
  },
];

export function humanizeAdminError(raw: string, isNetwork: boolean): string {
  if (isNetwork) return humanizeNetworkFailure();
  const s = raw.trim();
  if (!s) return "Something went wrong. Please try again.";
  for (const { test, msg } of ADMIN_SNIPPETS) {
    if (test(s)) return msg;
  }
  if (s.length < 80 && !/[/_]{3,}/.test(s) && !s.includes("http")) return s;
  return "Something went wrong. Please try again.";
}

const SLUG_MAP: Record<string, string> = {
  request_failed: "That didn't work. Please try again.",
  transfer_failed: "We couldn't update that payment. Please try again.",
  mono_token_exchange_failed: "We couldn't connect to your bank. Please try again.",
  signup_failed: "We couldn't create your account. Please try again.",
  cancel_failed: "We couldn't cancel your plan. Please try again or contact support.",
  subscription_already_in_progress:
    "You already have an active plan or a transfer awaiting admin approval. If your plan has expired, refresh the page and try resubscribing.",
  transaction_reference_already_used:
    "That payment reference was already used. Enter a new bank reference.",
  invalid_plan_cycle: "That plan and billing cycle do not match. Please pick the correct plan card.",
  amount_due_invalid: "Enter a valid amount due and try again.",
  transfer_request_failed: "We couldn't submit that transfer reference. Please try again.",
  subscription_not_cancellable: "There's nothing to cancel on this account.",
  password_change_failed: "We couldn't update your password. Please try again.",
  invalid_password_fields: "Please fill in both password fields. Your new password needs to be at least 8 characters.",
  invalid_current_password: "That current password isn't correct.",
};

export function humanizeApiSlug(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (SLUG_MAP[key]) return SLUG_MAP[key];
  if (/^[a-z0-9_]+$/.test(key) && key.length > 2) {
    return "Something went wrong. Please try again.";
  }
  if (raw.length > 0 && raw.length < 120 && !raw.includes("_")) return raw;
  return "Something went wrong. Please try again.";
}

export function humanizeMonoForUser(raw: string, context: "connect" | "balance" | "transactions"): string {
  const s = raw.trim().toLowerCase();
  if (s.includes("next_public_mono") || s.includes("env.local") || s.includes("public_key")) {
    return "Bank linking isn't set up on this site yet. Please try again later or contact support.";
  }
  if (s.includes("no auth code") || s.includes("returned no")) {
    return "The bank window closed before we could finish. Please try connecting again.";
  }
  if (s.includes("connect") && s.includes("first")) {
    return "Connect your bank first, then try again.";
  }
  if (context === "balance") return "We couldn't load your balance. Please try again.";
  if (context === "transactions") return "We couldn't load your transactions. Please try again.";
  return "We couldn't complete that bank step. Please try again.";
}
