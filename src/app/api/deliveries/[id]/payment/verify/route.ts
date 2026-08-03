// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { applySuccessfulPayment } from "@/server/payments";

// Signed-in is the only requirement here — this is a latency shortcut, not a
// trust shortcut. applySuccessfulPayment still asks Paystack what actually
// happened, and checks the reference against the specific delivery it was
// issued for, so an authenticated-but-unrelated caller still can't conjure a
// code for someone else's delivery.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await params; // deliveryId isn't needed directly — the reference carries it via Paystack metadata.
    const body = await request.json().catch(() => null);
    const reference = body?.reference;
    if (typeof reference !== "string" || !reference) {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
    }

    const result = await applySuccessfulPayment(reference);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/deliveries/[id]/payment/verify failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
