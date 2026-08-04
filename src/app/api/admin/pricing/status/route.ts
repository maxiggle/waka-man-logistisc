// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { isAdminOrSuperAdmin } from "@/server/roles";
import { getPricingConfig } from "@/server/pricingConfig";

/**
 * Health check for the /admin banner (WM-104) — any admin can call this,
 * not just a superadmin, because "booking is completely down" is
 * operationally relevant to whoever's watching the dashboard, not just
 * whoever can change prices. Deliberately returns nothing but a boolean:
 * the actual config/pricing document (margin structure) stays
 * superadmin-only, reachable only through /api/admin/pricing.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminOrSuperAdmin(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const config = await getPricingConfig();
    return NextResponse.json({ healthy: config !== null });
  } catch (err) {
    console.error("GET /api/admin/pricing/status failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
