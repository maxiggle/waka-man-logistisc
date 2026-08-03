// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidAndEmailFromRequest } from "@/server/firebaseAdmin";
import { initializePayment } from "@/server/payments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getUidAndEmailFromRequest(request);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: deliveryId } = await params;
    const result = await initializePayment(deliveryId, caller.uid, caller.email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    // Only the access code and reference — the amount is not the client's
    // to learn from this response; they already see the quote.
    return NextResponse.json({ accessCode: result.accessCode, reference: result.reference });
  } catch (err) {
    console.error("POST /api/deliveries/[id]/payment/initialize failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
