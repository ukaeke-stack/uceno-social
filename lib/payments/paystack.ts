import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export type PaystackTransaction = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  customer?: { email?: string };
  metadata?: Record<string, unknown> | null;
};

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackTransaction> {
  if (!reference || reference.length > 200) throw new Error("Invalid payment reference");
  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey()}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw new Error(`Paystack verification failed with HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Invalid Paystack verification response");
  const envelope = payload as { status?: boolean; data?: PaystackTransaction };
  if (envelope.status !== true || !envelope.data) throw new Error("Paystack did not confirm transaction");
  return envelope.data;
}

export function digestProviderPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
