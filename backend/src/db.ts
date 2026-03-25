import { Pool, type QueryResultRow } from "pg";

/** Used only when `DATABASE_URL` is unset (local Docker Postgres on host 5433). */
const FALLBACK_LOCAL_URL = "postgresql://credra:credra@127.0.0.1:5433/credra";

function connectionString(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) return raw;
  return FALLBACK_LOCAL_URL;
}

/**
 * Supabase and other cloud hosts require TLS. Localhost does not.
 * Override with DATABASE_SSL=false or DATABASE_SSL=true.
 */
function sslOption(
  url: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  const mode = process.env.DATABASE_SSL?.toLowerCase();
  if (mode === "false" || mode === "0" || mode === "disable") {
    return undefined;
  }
  if (mode === "true" || mode === "require") {
    return { rejectUnauthorized: true };
  }

  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return undefined;
    }
  } catch {
    /* non-URL strings: assume remote */
  }

  if (
    /@localhost[:/]/i.test(url) ||
    /@127\.0\.0\.1[:/]/.test(url) ||
    /@\[::1\][:]/i.test(url)
  ) {
    return undefined;
  }

  // Remote TLS: Node often hits SELF_SIGNED_CERT_IN_CHAIN against Supabase/poolers unless
  // verification is relaxed. Default permissive; set DATABASE_SSL_REJECT_UNAUTHORIZED=true for strict CA verification (production).
  const strict =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true";
  return { rejectUnauthorized: strict };
}

const cs = connectionString();

const pool = new Pool({
  connectionString: cs,
  ssl: sslOption(cs),
  connectionTimeoutMillis: 15_000,
});

if (!process.env.DATABASE_URL?.trim()) {
  console.warn(
    "[credra-db] DATABASE_URL is not set; using default %s. Set DATABASE_URL in backend/.env (e.g. same Supabase URI as processing/.env).",
    FALLBACK_LOCAL_URL.replace(/:[^:@]+@/, ":****@"),
  );
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
