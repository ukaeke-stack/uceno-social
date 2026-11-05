import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreditPackage = { credits: number; prices: Record<string, number> };

function configuredPackages(): Record<string, CreditPackage> {
  const raw = process.env.UCENO_CREDIT_PACKAGES_JSON;
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("UCENO_CREDIT_PACKAGES_JSON is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Credit package configuration must be an object");
  const result: Record<string, CreditPackage> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-z0-9_-]{2,50}$/.test(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as { credits?: unknown; prices?: unknown };
    if (!Number.isSafeInteger(item.credits) || Number(item.credits) < 1 || !item.prices || typeof item.prices !== "object" || Array.isArray(item.prices)) continue;
    const prices: Record<string, number> = {};
    for (const [currency, amount] of Object.entries(item.prices as Record<string, unknown>)) {
      if (/^[A-Z]{3}$/.test(currency) && Number.isSafeInteger(amount) && Number(amount) > 0) prices[currency] = Number(amount);
    }
    if (Object.keys(prices).length) result[key] = { credits: Number(item.credits), prices };
  }
  return result;
}

function paystackSecret(): string {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return value;
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as { packageId?: unknown; currency?: unknown; idempotencyKey?: unknown };
  if (typeof input.packageId !== "string" || !/^[a-z0-9_-]{2,50}$/.test(input.packageId) ||
      typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency) ||
      typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 160 ||
      !/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)) {
    return NextResponse.json({ error: "Provide a valid packageId, uppercase currency, and idempotencyKey" }, { status: 400 });
  }

  try {
    const packages = configuredPackages();
    const pack = packages[input.packageId];
    const amountMinor = pack?.prices[input.currency];
    if (!pack || !amountMinor) {
      return NextResponse.json({ error: "This credit package and currency are not configured" }, { status: 422 });
    }

    const sql = getDb();
    const users = await sql`SELECT email FROM users WHERE id = ${session.id}::uuid LIMIT 1`;
    const email = users[0]?.email;
    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "An email address is required for Paystack checkout" }, { status: 422 });
    }

    const existing = await sql`
      SELECT id, amount_minor AS "amountMinor", currency, purchased_credits AS "purchasedCredits",
             status, provider_reference AS "providerReference",
             provider_checkout_url AS "checkoutUrl", provider_access_code AS "accessCode"
      FROM uceno_credit_topup_intents
      WHERE user_id = ${session.id}::uuid AND client_idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    let intent = existing[0];
    if (intent) {
      if (Number(intent.amountMinor) !== amountMinor || String(intent.currency).trim() !== input.currency ||
          Number(intent.purchasedCredits) !== pack.credits || intent.status !== "pending") {
        return NextResponse.json({ error: "Idempotency key was already used for a different or completed request" }, { status: 409 });
      }
      if (intent.checkoutUrl && intent.accessCode) {
        return NextResponse.json({ authorizationUrl: intent.checkoutUrl, accessCode: intent.accessCode, reference: intent.providerReference });
      }
    } else {
      // Basic database-backed abuse guard. Existing idempotent retries above are
      // allowed; only creation of a new intent consumes this short-window quota.
      const recent = await sql`
        SELECT COUNT(*)::integer AS count
        FROM uceno_credit_topup_intents
        WHERE user_id = ${session.id}::uuid
          AND provider = 'paystack'
          AND created_at > NOW() - INTERVAL '15 minutes'
      `;
      if (Number(recent[0]?.count ?? 0) >= 5) {
        return NextResponse.json({ error: "Too many checkout attempts. Try again later." }, { status: 429 });
      }
      const created = await sql`
        INSERT INTO uceno_credit_topup_intents
          (user_id, provider, client_idempotency_key, amount_minor, currency, purchased_credits)
        VALUES
          (${session.id}::uuid, 'paystack', ${input.idempotencyKey}, ${amountMinor}, ${input.currency}, ${pack.credits})
        ON CONFLICT (user_id, client_idempotency_key) DO NOTHING
        RETURNING id, amount_minor AS "amountMinor", currency, purchased_credits AS "purchasedCredits",
                  status, provider_reference AS "providerReference",
                  provider_checkout_url AS "checkoutUrl", provider_access_code AS "accessCode"
      `;
      intent = created[0];
      if (!intent) {
        const retry = await sql`
          SELECT id, amount_minor AS "amountMinor", currency, purchased_credits AS "purchasedCredits",
                 status, provider_reference AS "providerReference",
                 provider_checkout_url AS "checkoutUrl", provider_access_code AS "accessCode"
          FROM uceno_credit_topup_intents
          WHERE user_id = ${session.id}::uuid AND client_idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        `;
        intent = retry[0];
      }
      if (!intent) throw new Error("Could not create top-up intent");
    }

    // Stable reference lets retries recover the same provider transaction rather than
    // creating a new reference for a single idempotency key.
    const reference = typeof intent.providerReference === "string" && intent.providerReference
      ? intent.providerReference
      : `uceno_${String(intent.id).replace(/-/g, "")}`;
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
    if (!callbackUrl || !callbackUrl.startsWith("https://")) {
      return NextResponse.json({ error: "PAYSTACK_CALLBACK_URL must be configured as an HTTPS URL" }, { status: 503 });
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency: input.currency,
        reference,
        callback_url: callbackUrl,
        metadata: { uceno_topup_intent_id: String(intent.id), uceno_package_id: input.packageId },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object" ||
        (payload as { status?: unknown }).status !== true ||
        !(payload as { data?: { authorization_url?: unknown; access_code?: unknown } }).data ||
        typeof (payload as { data: { authorization_url?: unknown } }).data.authorization_url !== "string" ||
        typeof (payload as { data: { access_code?: unknown } }).data.access_code !== "string") {
      console.error("Paystack initialization failed", { status: response.status, intentId: intent.id });
      return NextResponse.json({ error: "Paystack checkout could not be initialized" }, { status: 502 });
    }
    const data = (payload as { data: { authorization_url: string; access_code: string } }).data;
    await sql`
      UPDATE uceno_credit_topup_intents
      SET provider_reference = ${reference},
          provider_access_code = ${data.access_code},
          provider_checkout_url = ${data.authorization_url},
          provider_amount_minor = ${amountMinor},
          provider_currency = ${input.currency},
          updated_at = NOW()
      WHERE id = ${intent.id}::uuid AND user_id = ${session.id}::uuid AND status = 'pending'
    `;
    return NextResponse.json({ authorizationUrl: data.authorization_url, accessCode: data.access_code, reference });
  } catch (error) {
    console.error("Paystack top-up initialization failed", error);
    return NextResponse.json({ error: "Credit checkout is temporarily unavailable" }, { status: 503 });
  }
}
