import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

const COOKIE_NAME = "uceno_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; handle: string }) {
  const token = await new SignJWT({ handle: user.handle })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function readSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.handle !== "string") return null;
    const sql = getDb();
    const accounts = await sql`SELECT moderation_status AS "moderationStatus", suspended_until AS "suspendedUntil"
      FROM users WHERE id = ${payload.sub}::uuid LIMIT 1`;
    if (!accounts.length || accounts[0].moderationStatus === "disabled") return null;
    if (accounts[0].moderationStatus === "suspended") {
      const until = accounts[0].suspendedUntil ? new Date(accounts[0].suspendedUntil).getTime() : Number.POSITIVE_INFINITY;
      if (until > Date.now()) return null;
      await sql`UPDATE users SET moderation_status = 'active', suspended_until = NULL,
        moderation_note = NULL, moderated_at = NOW() WHERE id = ${payload.sub}::uuid AND moderation_status = 'suspended'`;
    }
    return { id: payload.sub, handle: payload.handle };
  } catch { return null; }
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
