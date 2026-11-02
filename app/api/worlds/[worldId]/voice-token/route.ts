import { NextRequest, NextResponse } from "next/server";
import { readWorldClientSession } from "@/lib/world-client-session";

export const runtime = "nodejs";

/**
 * Deliberately fail closed until media admission is pair-scoped.
 *
 * A world-wide LiveKit room with canSubscribe=true exposes every published
 * microphone track to every room participant. The gateway's 24 m signaling
 * policy does not constrain LiveKit media subscriptions. Never issue a token
 * based only on world presence or a client-selected zone.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  const { worldId } = await params;
  const session = await readWorldClientSession(request, worldId);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in or reconnect to this world" },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { error: "Spatial voice is unavailable until proximity-scoped media authorization is deployed" },
    {
      status: 503,
      headers: { "Cache-Control": "no-store, private" }
    }
  );
}
