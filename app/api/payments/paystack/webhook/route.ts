import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  digestProviderPayload,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from "@/lib/payments/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    metadata?: Record<string, unknown> | null;
  };
};

// The webhook is only a trigger. Credits are issued only after server-to-server
// verification and exact matching against the stored pending intent.
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read webhook body" }, { status: 400 });
  }
  if (rawBody.length > 256_000) {
    return NextResponse.json({ error: "Webhook payload too large" }, { status: 413 });
  }

  try {
    if (!verifyPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"))) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } catch (error) {
    console.error("Paystack signature verification is not configured", error);
    return NextResponse.json({ error: "Payment verification is not configured" }, { status: 503 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Acknowledge irrelevant signed events without changing financial state.
  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || reference.length < 1 || reference.length > 200) {
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const intents = await sql`
      SELECT id, amount_minor AS "amountMinor", currency,
             purchased_credits AS "purchasedCredits", status, provider_reference AS "providerReference"
      FROM uceno_credit_topup_intents
      WHERE provider = 'paystack' AND provider_reference = ${reference}
      LIMIT 1
    `;
    const intent = intents[0];
    if (!intent) {
      // Do not acknowledge an unknown reference as successfully processed.
      return NextResponse.json({ error: "Payment intent not found" }, { status: 404 });
    }

    const transaction = await verifyPaystackTransaction(reference);
    const metadataIntentId = transaction.metadata?.uceno_topup_intent_id ??
      event.data?.metadata?.uceno_topup_intent_id;

    if (transaction.status !== "success" ||
        transaction.reference !== reference ||
        !Number.isSafeInteger(transaction.amount) ||
        transaction.amount !== Number(intent.amountMinor) ||
        transaction.currency.toUpperCase() !== String(intent.currency).trim().toUpperCase() ||
        String(metadataIntentId ?? "") !== String(intent.id)) {
      console.error("Paystack transaction verification mismatch", { intentId: intent.id, reference });
      return NextResponse.json({ error: "Verified payment does not match the top-up intent" }, { status: 409 });
    }

    // The SQL function atomically writes the ledger, increments the wallet, and
    // marks the intent paid. A duplicate successful event returns issued=false.
    const result = await sql`
      SELECT issued, purchased_balance AS "purchasedBalance"
      FROM issue_verified_purchased_credits(
        ${intent.id}::uuid,
        ${reference},
        ${String(transaction.id)},
        ${transaction.amount}::bigint,
        ${transaction.currency},
        ${digestProviderPayload(rawBody)}
      )
    `;
    return NextResponse.json({ received: true, issued: Boolean(result[0]?.issued) });
  } catch (error) {
    // Return 5xx for transient provider/database errors so Paystack can retry.
    console.error("Paystack webhook processing failed", error);
    return NextResponse.json({ error: "Payment event could not be processed" }, { status: 503 });
  }
}
