import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = loginSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Enter your email or phone number and password" }, { status: 400 });
    const identifier = input.data.identifier.trim().toLowerCase();
    const sql = getDb();
    const rows = await sql`SELECT id, display_name AS "displayName", handle, email, phone, password_hash AS "passwordHash" FROM users WHERE email = ${identifier} OR phone = ${identifier} LIMIT 1`;
    const user = rows[0] as { id: string; handle: string; passwordHash: string } | undefined;
    if (!user || !(await compare(input.data.password, user.passwordHash))) return NextResponse.json({ error: "Invalid sign-in details" }, { status: 401 });
    await createSession({ id: String(user.id), handle: user.handle });
    const { passwordHash: _passwordHash, ...safeUser } = user as typeof user & Record<string, unknown>;
    return NextResponse.json({ user: safeUser });
  } catch (error) {
    console.error("UCENO login error", error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Check server configuration." }, { status: 503 });
  }
}
