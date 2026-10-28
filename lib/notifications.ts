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
    const tokens = devices.map((row: { token: string }) => String(row.token)).filter(Boolean);
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
