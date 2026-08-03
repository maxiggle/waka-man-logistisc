// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidAndEmailFromRequest } from "@/server/firebaseAdmin";
import { createDelivery } from "@/server/deliveries";

/**
 * Books a delivery. The caller supplies only the trip details; identity and
 * price both come from the server (the verified token and
 * src/server/fare.ts respectively), which is the whole point of this
 * endpoint existing — see the header comment in src/server/deliveries.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getUidAndEmailFromRequest(request);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const result = await createDelivery(body, caller.uid, caller.name, caller.email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json(
      { deliveryId: result.deliveryId, quotedAmountKobo: result.quotedAmountKobo },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/deliveries failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
