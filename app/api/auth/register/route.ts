import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/session";
import { registerSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = registerSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Check your details" }, { status: 400 });
    const value = input.data;
    const email = value.contactType === "email" ? value.email!.toLowerCase() : null;
    const phone = value.contactType === "phone" ? value.phone! : null;
    const passwordHash = await hash(value.password, 12);
    const sql = getDb();
    const existing = await sql`SELECT id FROM users WHERE handle = ${value.handle} OR (${email}::text IS NOT NULL AND email = ${email}) OR (${phone}::text IS NOT NULL AND phone = ${phone}) LIMIT 1`;
    if (existing.length) return NextResponse.json({ error: "That handle or contact is already registered" }, { status: 409 });
    const rows = await sql`INSERT INTO users (display_name, handle, email, phone, password_hash) VALUES (${value.displayName}, ${value.handle}, ${email}, ${phone}, ${passwordHash}) RETURNING id, display_name AS "displayName", handle, email, phone, created_at AS "createdAt"`;
    await createSession({ id: String(rows[0].id), handle: String(rows[0].handle) });
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "That handle or contact is already registered" }, { status: 409 });
    console.error("UCENO registration error", error);
    return NextResponse.json({ error: "Registration is temporarily unavailable. Check server configuration." }, { status: 503 });
  }
}
