// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { advanceDeliveryStatus, type NonTerminalStatus } from "@/server/deliveryLifecycle";

const ALLOWED_TARGETS: (NonTerminalStatus | "pending")[] = ["picked_up", "in_transit", "arrived", "pending"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: deliveryId } = await params;
    const body = await request.json().catch(() => null);
    const status = body?.status;
    if (typeof status !== "string" || !ALLOWED_TARGETS.includes(status as NonTerminalStatus | "pending")) {
      return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
    }

    const result = await advanceDeliveryStatus(deliveryId, uid, status as NonTerminalStatus | "pending");
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/deliveries/[id]/status failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
