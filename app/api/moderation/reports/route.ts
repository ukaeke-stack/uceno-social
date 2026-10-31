import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
const statusSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["reviewing", "dismissed", "actioned"])
});
const enforcementSchema = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["warn", "suspend", "disable", "remove_content", "restore_account", "restore_content"]),
  reason: z.string().trim().max(1000).default(""),
  durationDays: z.number().int().min(1).max(365).optional()
});

async function moderatorSession() {
  const session = await readSession();
  if (!session) return null;
  const sql = getDb();
  const allowed = (process.env.UCENO_MODERATOR_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  const grants = await sql`SELECT revoked_at AS "revokedAt" FROM moderator_access WHERE user_id = ${session.id}::uuid LIMIT 1`;
  const active = grants.length ? !grants[0].revokedAt : allowed.includes(session.id);
  return active ? session : null;
}

export async function GET(request: Request) {
  const session = await moderatorSession();
  if (!session) return NextResponse.json({ error: "Moderator access required" }, { status: 403 });
  try {
    const sql = getDb();
    const reports = await sql`
      SELECT r.id, r.target_type AS "targetType", r.target_id AS "targetId", r.reason, r.details,
        r.status, r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt",
        reporter.handle AS "reporterHandle",
        CASE WHEN r.target_type = 'user' THEN target_user.handle
             WHEN r.target_type = 'post' THEN post_owner.handle
             ELSE comment_owner.handle END AS "targetHandle",
        CASE WHEN r.target_type = 'post' THEN LEFT(p.body, 240)
             WHEN r.target_type = 'comment' THEN LEFT(c.body, 240)
             ELSE NULL END AS "targetExcerpt",
        CASE WHEN r.target_type = 'user' THEN target_user.moderation_status ELSE NULL END AS "targetModerationStatus",
        CASE WHEN r.target_type = 'user' THEN target_user.suspended_until ELSE NULL END AS "suspendedUntil",
        CASE WHEN r.target_type = 'post' THEN p.moderation_removed_at
             WHEN r.target_type = 'comment' THEN c.moderation_removed_at
             ELSE NULL END AS "contentRemovedAt"
      FROM user_reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users target_user ON r.target_type = 'user' AND target_user.id = r.target_id
      LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
      LEFT JOIN users post_owner ON post_owner.id = p.user_id
      LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
      LEFT JOIN users comment_owner ON comment_owner.id = c.user_id
      WHERE (${new URL(request.url).searchParams.get("all") === "1"} OR r.status <> 'dismissed')
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'actioned' THEN 2 ELSE 3 END, r.created_at DESC
      LIMIT 500
    `;
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("UCENO moderation queue error", error);
    return NextResponse.json({ error: "Moderation queue unavailable. Apply migrations 011 and 013." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await moderatorSession();
  if (!session) return NextResponse.json({ error: "Moderator access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const statusInput = statusSchema.safeParse(body);
  const enforcementInput = enforcementSchema.safeParse(body);
  if (!statusInput.success && !enforcementInput.success) {
    return NextResponse.json({ error: "Provide a valid report status or enforcement action" }, { status: 400 });
  }

  try {
    const sql = getDb();
    if (statusInput.success) {
      const rows = await sql`
        UPDATE user_reports SET status = ${statusInput.data.status},
          reviewed_at = CASE WHEN ${statusInput.data.status} = 'reviewing' THEN NULL ELSE NOW() END,
          reviewed_by = ${session.id}::uuid
        WHERE id = ${statusInput.data.reportId}::uuid
        RETURNING id, status
      `;
      if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      return NextResponse.json({ report: rows[0] });
    }

    if (!enforcementInput.success) return NextResponse.json({ error: "Invalid enforcement action" }, { status: 400 });
    const input = enforcementInput.data;
    const reportRows = await sql`SELECT id, target_type AS "targetType", target_id AS "targetId"
      FROM user_reports WHERE id = ${input.reportId}::uuid LIMIT 1`;
    if (!reportRows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const report = reportRows[0] as { id: string; targetType: "user" | "post" | "comment"; targetId: string };
    const userAction = ["warn", "suspend", "disable", "restore_account"].includes(input.action);
    const contentAction = ["remove_content", "restore_content"].includes(input.action);
    if ((userAction && report.targetType !== "user") ||
        (contentAction && report.targetType === "user")) {
      return NextResponse.json({ error: "That enforcement action does not match the reported target" }, { status: 400 });
    }
    if (input.action === "suspend" && !input.durationDays) {
      return NextResponse.json({ error: "Choose a suspension duration from 1 to 365 days" }, { status: 400 });
    }

    let changed: any[] = [];
    if (userAction) {
      changed = await sql`
        WITH target AS (
          SELECT id FROM users WHERE id = ${report.targetId}::uuid
        ), updated AS (
          UPDATE users SET
            moderation_status = CASE
              WHEN ${input.action} = 'suspend' THEN 'suspended'
              WHEN ${input.action} = 'disable' THEN 'disabled'
              WHEN ${input.action} = 'restore_account' THEN 'active'
              ELSE moderation_status END,
            suspended_until = CASE
              WHEN ${input.action} = 'suspend' THEN NOW() + (${input.durationDays ?? 1} * INTERVAL '1 day')
              WHEN ${input.action} IN ('disable','restore_account') THEN NULL
              ELSE suspended_until END,
            moderation_note = ${input.reason},
            moderated_at = NOW(),
            moderated_by = ${session.id}::uuid,
            updated_at = NOW()
          WHERE id IN (SELECT id FROM target)
          RETURNING id
        ), logged AS (
          INSERT INTO moderation_actions (report_id, moderator_id, target_type, target_id, action, reason, duration_days)
          SELECT ${report.id}::uuid, ${session.id}::uuid, 'user', updated.id, ${input.action}, ${input.reason}, ${input.durationDays ?? null}
          FROM updated RETURNING id
        ), report_update AS (
          UPDATE user_reports SET status = 'actioned', reviewed_at = NOW(), reviewed_by = ${session.id}::uuid
          WHERE id = ${report.id}::uuid AND EXISTS (SELECT 1 FROM logged)
          RETURNING id, status
        )
        SELECT updated.id, report_update.status FROM updated CROSS JOIN report_update
      `;
    } else if (report.targetType === "post") {
      changed = await sql`
        WITH updated AS (
          UPDATE posts SET moderation_removed_at = CASE WHEN ${input.action} = 'remove_content' THEN NOW() ELSE NULL END,
            moderation_removed_by = CASE WHEN ${input.action} = 'remove_content' THEN ${session.id}::uuid ELSE NULL END
          WHERE id = ${report.targetId}::uuid RETURNING id
        ), logged AS (
          INSERT INTO moderation_actions (report_id, moderator_id, target_type, target_id, action, reason)
          SELECT ${report.id}::uuid, ${session.id}::uuid, 'post', updated.id, ${input.action}, ${input.reason}
          FROM updated RETURNING id
        ), report_update AS (
          UPDATE user_reports SET status = 'actioned', reviewed_at = NOW(), reviewed_by = ${session.id}::uuid
          WHERE id = ${report.id}::uuid AND EXISTS (SELECT 1 FROM logged)
          RETURNING id, status
        )
        SELECT updated.id, report_update.status FROM updated CROSS JOIN report_update
      `;
    } else {
      changed = await sql`
        WITH updated AS (
          UPDATE comments SET moderation_removed_at = CASE WHEN ${input.action} = 'remove_content' THEN NOW() ELSE NULL END,
            moderation_removed_by = CASE WHEN ${input.action} = 'remove_content' THEN ${session.id}::uuid ELSE NULL END
          WHERE id = ${report.targetId}::uuid RETURNING id
        ), logged AS (
          INSERT INTO moderation_actions (report_id, moderator_id, target_type, target_id, action, reason)
          SELECT ${report.id}::uuid, ${session.id}::uuid, 'comment', updated.id, ${input.action}, ${input.reason}
          FROM updated RETURNING id
        ), report_update AS (
          UPDATE user_reports SET status = 'actioned', reviewed_at = NOW(), reviewed_by = ${session.id}::uuid
          WHERE id = ${report.id}::uuid AND EXISTS (SELECT 1 FROM logged)
          RETURNING id, status
        )
        SELECT updated.id, report_update.status FROM updated CROSS JOIN report_update
      `;
    }
    if (!changed.length) return NextResponse.json({ error: "The reported account or content no longer exists" }, { status: 404 });

    if (input.action === "warn") {
      try {
        await createNotification({
          recipientId: report.targetId,
          actorId: session.id,
          type: "system",
          entityId: null,
          message: "UCENO moderation warning: " + (input.reason || "Please review and follow the community rules.")
        });
      } catch (notificationError) {
        console.error("UCENO moderation warning notification failed", notificationError);
      }
    }
    return NextResponse.json({ enforcement: { action: input.action, targetId: report.targetId }, report: { id: report.id, status: "actioned" } });
  } catch (error) {
    console.error("UCENO moderation enforcement error", error);
    return NextResponse.json({ error: "Could not apply the moderation action. Confirm migration 013 is applied." }, { status: 503 });
  }
}
