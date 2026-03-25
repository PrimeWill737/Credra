import jwt, { type JwtPayload, type Secret, type SignOptions } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.ADMIN_JWT_SECRET ?? "dev-admin-jwt-secret-change-me";

export type AccessPayload = {
  sub: string;
  role: string;
  typ: "access";
};

export type Pending2faPayload = {
  sub: string;
  typ: "pending_2fa";
};

function signJwt(payload: JwtPayload, expiresIn: SignOptions["expiresIn"]) {
  const opts: SignOptions = { expiresIn };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function signAccessToken(email: string, role: string) {
  return signJwt({ sub: email, role, typ: "access" }, "12h");
}

export function signPending2faToken(email: string) {
  return signJwt({ sub: email, typ: "pending_2fa" }, "5m");
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & {
      typ?: string;
      role?: string;
    };
    if (decoded.typ !== "access" || typeof decoded.sub !== "string" || typeof decoded.role !== "string") {
      return null;
    }
    return { sub: decoded.sub, role: decoded.role, typ: "access" };
  } catch {
    return null;
  }
}

export function verifyPending2faToken(token: string): Pending2faPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { typ?: string };
    if (decoded.typ !== "pending_2fa" || typeof decoded.sub !== "string") {
      return null;
    }
    return { sub: decoded.sub, typ: "pending_2fa" };
  } catch {
    return null;
  }
}
