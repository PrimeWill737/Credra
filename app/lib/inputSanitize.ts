/**
 * Client-side input normalization and bounds.
 * Treat as UX + defense-in-depth; the API must still validate and authorize.
 */

/** C0/C1 control characters except common whitespace we normalize away separately */
const CTRL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/g;

const EMAIL_LOCAL_PART = /^[^\s@]+$/;
const EMAIL_DOMAIN_PART = /^[^\s@]+\.[^\s@]+$/;

export function stripControlChars(input: string): string {
  return input.replace(CTRL_CHARS, "");
}

export function truncateUtf16(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
}

/** Single-line text: no newlines/tabs, collapsed spaces, trimmed */
export function sanitizePlainLine(input: string, maxLen: number): string {
  return truncateUtf16(
    stripControlChars(input)
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    maxLen,
  );
}

/** Company / display names: letters, numbers, common punctuation; bounded */
export function sanitizeOrganizationName(input: string, maxLen = 120): string {
  const raw = stripControlChars(input).replace(/[\r\n\t]+/g, " ");
  const cleaned = raw.replace(/[^\p{L}\p{N}\s'’.,&()\-+/]/gu, "");
  return truncateUtf16(cleaned.replace(/\s+/g, " ").trim(), maxLen);
}

export function sanitizePersonName(input: string, maxLen = 120): string {
  return sanitizeOrganizationName(input, maxLen);
}

export function sanitizeEmailInput(input: string, maxLen = 254): string {
  const s = truncateUtf16(stripControlChars(input).trim().toLowerCase(), maxLen);
  return s.replace(/\s+/g, "");
}

export function isPlausibleEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return (
    local.length <= 64 &&
    domain.length <= 253 &&
    EMAIL_LOCAL_PART.test(local) &&
    EMAIL_DOMAIN_PART.test(domain)
  );
}

/**
 * Passwords: do not trim or strip printable characters; remove controls and cap length.
 */
export function sanitizePasswordInput(input: string, maxLen = 128): string {
  return truncateUtf16(stripControlChars(input), maxLen);
}

export function sanitizeOtpDigits(input: string, maxDigits = 6): string {
  return stripControlChars(input).replace(/\D/g, "").slice(0, maxDigits);
}

export function sanitizeTotpDigits(input: string, maxDigits = 6): string {
  return sanitizeOtpDigits(input, maxDigits);
}

/** Optional signed decimal for playground / amounts typed as text */
export function sanitizeSignedDecimalInput(input: string, maxLen = 24): string {
  const s = stripControlChars(input);
  let out = "";
  let sawDot = false;
  let signAllowed = true;
  for (const ch of s) {
    if (signAllowed && (ch === "-" || ch === "+")) {
      if (ch === "-") out += "-";
      signAllowed = false;
      continue;
    }
    signAllowed = false;
    if (ch >= "0" && ch <= "9") {
      if (out.length < maxLen) out += ch;
      continue;
    }
    if (ch === "." && !sawDot) {
      sawDot = true;
      if (out.length < maxLen) out += ch;
    }
  }
  return truncateUtf16(out, maxLen);
}

export function sanitizeUnsignedDecimalInput(input: string, maxLen = 24): string {
  const s = stripControlChars(input);
  let out = "";
  let sawDot = false;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      if (out.length < maxLen) out += ch;
    } else if (ch === "." && !sawDot) {
      sawDot = true;
      if (out.length < maxLen) out += ch;
    }
  }
  return truncateUtf16(out, maxLen);
}

export function sanitizePositiveIntegerString(input: string, maxLen = 10): string {
  return truncateUtf16(stripControlChars(input).replace(/\D/g, ""), maxLen);
}

export function sanitizeVolatilityHintInput(input: string, maxLen = 8): string {
  return sanitizeUnsignedDecimalInput(input, maxLen);
}

const TX_REF_INVALID = /[^a-zA-Z0-9/_\-:.]/g;

export function sanitizeTransactionReference(input: string, maxLen = 120): string {
  return truncateUtf16(
    stripControlChars(input).replace(TX_REF_INVALID, "").trim(),
    maxLen,
  );
}

export function sanitizePlanNameInput(input: string, maxLen = 64): string {
  const cleaned = stripControlChars(input).replace(
    /[^\p{L}\p{N}\s\-+.]/gu,
    "",
  );
  return truncateUtf16(cleaned.replace(/\s+/g, " ").trim(), maxLen);
}

const BILLING_CYCLES = new Set(["weekly", "monthly", "yearly"]);

export function sanitizeBillingCycle(
  input: string,
): "weekly" | "monthly" | "yearly" {
  const v = stripControlChars(input).trim().toLowerCase();
  if (BILLING_CYCLES.has(v)) return v as "weekly" | "monthly" | "yearly";
  return "monthly";
}

const MONO_CODE_CHARS = /[^a-zA-Z0-9_-]/g;

export function sanitizeMonoAuthCode(input: string, maxLen = 512): string {
  return truncateUtf16(stripControlChars(input).replace(MONO_CODE_CHARS, ""), maxLen);
}

export function sanitizePendingToken(input: string, maxLen = 512): string {
  return truncateUtf16(
    stripControlChars(input).replace(/[^\w.-]/g, ""),
    maxLen,
  );
}
