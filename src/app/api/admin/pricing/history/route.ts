// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { isSuperAdmin } from "@/server/roles";
import { listPricingHistory } from "@/server/pricingConfig";

/**
 * Read side of the pricingHistory audit trail (WM-101 Phase 2) — "the
 * prices changed and nobody knows who" is not acceptable for a
 * client-operated money control, so this exists to make the write side
 * (updatePricingConfig) actually visible somewhere, not just recorded.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const entries = await listPricingHistory(20);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("GET /api/admin/pricing/history failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
