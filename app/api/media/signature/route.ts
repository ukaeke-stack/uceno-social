import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to upload media" }, { status: 401 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Media storage is not configured yet. Ask the UCENO administrator to configure Cloudinary." }, { status: 503 });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "uceno/" + session.id;
  const params = "folder=" + folder + "&timestamp=" + timestamp;
  const signature = createHash("sha1").update(params + apiSecret).digest("hex");
  return NextResponse.json({ cloudName, apiKey, timestamp: Number(timestamp), folder, signature });
}
