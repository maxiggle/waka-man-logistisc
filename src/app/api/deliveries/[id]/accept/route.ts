// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { acceptDelivery } from "@/server/deliveryOffers";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: deliveryId } = await params;
    const result = await acceptDelivery(deliveryId, uid);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/deliveries/[id]/accept failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
