import { getDb } from "@/lib/db";

export type NotificationType = "like" | "comment" | "repost" | "message" | "follow" | "story" | "system";

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
}
