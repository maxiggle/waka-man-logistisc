// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { createQuote } from "@/server/quotes";

/**
 * Prices a trip. The booking form calls this once both addresses resolve
 * (debounced) and again whenever the tier or either address changes, then
 * books with the returned quoteId — see src/server/quotes.ts for why
 * booking reads this back rather than re-pricing.
 */
export async function POST(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const result = await createQuote(body, uid);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({
      quoteId: result.quoteId,
      amountKobo: result.amountKobo,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      basis: result.basis,
    });
  } catch (err) {
    console.error("POST /api/quotes failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
