// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest } from "@/server/firebaseAdmin";
import { isSuperAdmin } from "@/server/roles";
import { getPricingConfig, updatePricingConfig } from "@/server/pricingConfig";
import {
  SERVICE_LEVEL_PRICING,
  ROUNDING_KOBO,
  DETOUR_FACTOR,
  MAX_TRIP_DISTANCE_KM,
} from "@/lib/dispatchConfig";
import type { PricingConfig, PricingConfigInput } from "@/lib/schemas";

function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/** config/pricing (kobo) reshaped into the admin form's naira-denominated input shape. */
function toInputShape(config: PricingConfig): PricingConfigInput {
  return {
    express: {
      baseNaira: koboToNaira(config.express.baseKobo),
      perKmNaira: koboToNaira(config.express.perKmKobo),
      minimumNaira: koboToNaira(config.express.minimumKobo),
    },
    standard: {
      baseNaira: koboToNaira(config.standard.baseKobo),
      perKmNaira: koboToNaira(config.standard.perKmKobo),
      minimumNaira: koboToNaira(config.standard.minimumKobo),
    },
    bulk: {
      baseNaira: koboToNaira(config.bulk.baseKobo),
      perKmNaira: koboToNaira(config.bulk.perKmKobo),
      minimumNaira: koboToNaira(config.bulk.minimumKobo),
    },
    roundingNaira: koboToNaira(config.roundingKobo),
    detourFactor: config.detourFactor,
    maxTripKm: config.maxTripKm,
  };
}

/** Seed defaults (src/lib/dispatchConfig.ts), reshaped the same way, for pre-filling the form before config/pricing exists. */
const SEED_INPUT: PricingConfigInput = toInputShape({
  express: SERVICE_LEVEL_PRICING.express,
  standard: SERVICE_LEVEL_PRICING.standard,
  bulk: SERVICE_LEVEL_PRICING.bulk,
  roundingKobo: ROUNDING_KOBO,
  detourFactor: DETOUR_FACTOR,
  maxTripKm: MAX_TRIP_DISTANCE_KM,
  updatedAt: 0,
  updatedBy: "",
});

export async function GET(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const config = await getPricingConfig();
    return NextResponse.json({
      current: config ? toInputShape(config) : null,
      seed: SEED_INPUT,
      updatedAt: config?.updatedAt ?? null,
    });
  } catch (err) {
    console.error("GET /api/admin/pricing failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const result = await updatePricingConfig(body, uid);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ current: toInputShape(result.config), updatedAt: result.config.updatedAt });
  } catch (err) {
    console.error("POST /api/admin/pricing failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
