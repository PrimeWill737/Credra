import jwt, { type JwtPayload, type Secret, type SignOptions } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.CLIENT_JWT_SECRET ?? "dev-client-jwt-secret-change-me";

export type ClientAccessPayload = {
  sub: string;
  typ: "client_access";
};

export type PendingEmailPayload = {
  sub: string;
  typ: "pending_email";
};

function signJwt(payload: JwtPayload, expiresIn: SignOptions["expiresIn"]) {
  const opts: SignOptions = { expiresIn };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function signClientAccessToken(email: string) {
  return signJwt({ sub: email, typ: "client_access" }, "12h");
}

export function signPendingEmailToken(email: string) {
  return signJwt({ sub: email, typ: "pending_email" }, "10m");
}

export function verifyClientAccessToken(token: string): ClientAccessPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { typ?: string; sub?: unknown };
    if (decoded.typ !== "client_access" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, typ: "client_access" };
  } catch {
    return null;
  }
}

export function verifyPendingEmailToken(token: string): PendingEmailPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { typ?: string; sub?: unknown };
    if (decoded.typ !== "pending_email" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, typ: "pending_email" };
  } catch {
    return null;
  }
}

