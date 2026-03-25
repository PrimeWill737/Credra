/**
 * Layer 1 — Mono Connect integration.
 * @see https://docs.mono.co/docs
 *
 * Set MONO_SECRET_KEY in the environment. Without it, responses are dev stubs.
 */

const MONO_BASE = process.env.MONO_API_BASE ?? "https://api.withmono.com";
const MONO_KEY = process.env.MONO_SECRET_KEY ?? "";

type MonoJson = Record<string, unknown>;

async function monoFetch(path: string, init?: RequestInit): Promise<MonoJson> {
  if (!MONO_KEY) {
    return {
      _stub: true,
      message:
        "MONO_SECRET_KEY not set — returning stub. Add your Mono secret to call the live API.",
      path,
    };
  }

  const url = `${MONO_BASE.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "mono-sec-key": MONO_KEY,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: MonoJson = {};
  try {
    data = text ? (JSON.parse(text) as MonoJson) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`mono_http_${res.status}`);
  }

  return data;
}

/** Exchange auth code for account id — endpoint shape follows Mono Connect. */
export async function exchangeMonoCode(code: string): Promise<MonoJson> {
  if (!MONO_KEY) {
    return {
      _stub: true,
      code,
      account: "acct_stub_" + code.slice(0, 8),
    };
  }
  return monoFetch("/account/auth", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getMonoAccountBalance(accountId: string): Promise<MonoJson> {
  if (!MONO_KEY) {
    return { _stub: true, accountId, balance: 125000.5, currency: "NGN" };
  }
  return monoFetch(`/accounts/${accountId}/balance`);
}

export async function listMonoTransactions(accountId: string): Promise<MonoJson> {
  if (!MONO_KEY) {
    return {
      _stub: true,
      accountId,
      data: [],
    };
  }
  return monoFetch(`/accounts/${accountId}/transactions`);
}
