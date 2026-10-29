import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getDb } from "@/lib/db";

export type NotificationType = "like" | "comment" | "repost" | "message" | "follow" | "story" | "system";

function getFirebaseMessaging() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
    return getMessaging(app);
  } catch (error) {
    console.error("UCENO Firebase Admin configuration is invalid", error);
    return null;
  }
}

export async function createNotification(input: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId?: string | null;
  message: string;
}) {
  if (!input.recipientId || !input.actorId || input.recipientId === input.actorId) return;
  const sql = getDb();
  await sql`
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, message)
    VALUES (${input.recipientId}::uuid, ${input.actorId}::uuid, ${input.type}, ${input.entityId ?? null}::uuid, ${input.message.slice(0, 240)})
  `;

  // Push is best-effort: an FCM outage must not undo the durable in-app notification.
  const messaging = getFirebaseMessaging();
  if (!messaging) return;
  try {
    const devices = await sql`SELECT token FROM push_tokens WHERE user_id = ${input.recipientId}::uuid`;
    const tokens = devices.map((row) => String(row.token)).filter(Boolean);
    if (!tokens.length) return;
    const url = input.type === "message" ? "/?section=messages"
      : input.type === "follow" ? "/?section=profile"
      : "/?section=notifications";
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: "UCENO", body: input.message.slice(0, 240) },
      data: { type: input.type, entityId: input.entityId ?? "", url },
      android: { priority: "high", notification: { channelId: "uceno_notifications", sound: "default" } },
    });
    const invalidTokens = result.responses.flatMap((response, index) =>
      !response.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code ?? "")
        ? [tokens[index]] : []);
    if (invalidTokens.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${invalidTokens}::text[])`;
  } catch (error) {
    console.error("UCENO push delivery failed; in-app notification was saved", error);
  }
}

export async function notifyIncomingCall(input: {
  recipientId: string;
  callerHandle: string;
  invitationId: string;
  mode: "audio" | "video";
}) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn("UCENO incoming-call push skipped: FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    return { sent: 0, reason: "firebase-not-configured" as const };
  }
  const sql = getDb();
  const devices = await sql`SELECT token FROM push_tokens WHERE user_id = ${input.recipientId}::uuid`;
  const tokens = devices.map((row) => String(row.token)).filter(Boolean);
  if (!tokens.length) return { sent: 0, reason: "no-registered-devices" as const };
  const url = "/calls?incoming=" + encodeURIComponent(input.invitationId);
  const result = await messaging.sendEachForMulticast({
    tokens,
    data: {
      type: "call",
      title: input.mode === "video" ? "Incoming video call" : "Incoming audio call",
      body: "@" + input.callerHandle + " is calling you",
      invitationId: input.invitationId,
      callerHandle: input.callerHandle,
      mode: input.mode,
      url,
    },
    android: {
      priority: "high",
      ttl: 60 * 1000,
      notification: {
        channelId: "uceno_incoming_calls_v2",
        sound: "default",
        priority: "max",
        visibility: "public",
        tag: "uceno-call-" + input.invitationId,
        clickAction: "FCM_PLUGIN_ACTIVITY",
      },
    },
    apns: { payload: { aps: { sound: "default", "content-available": 1 } } },
  });
  const invalidTokens = result.responses.flatMap((response, index) =>
    !response.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code ?? "")
      ? [tokens[index]] : []);
  if (invalidTokens.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${invalidTokens}::text[])`;
  const sent = result.responses.filter((response) => response.success).length;
  if (!sent) console.error("UCENO incoming-call push had no successful deliveries", result.responses.map((response) => response.error?.code ?? "unknown"));
  return { sent, reason: sent ? "sent" as const : "delivery-failed" as const };
}
