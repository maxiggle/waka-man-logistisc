// Admin-editable pricing (WM-101 Phase 2). config/pricing is the single
// document quoteFor() (src/server/fare.ts) prices every quote from —
// dispatchConfig.ts's SERVICE_LEVEL_PRICING table is only the seed value an
// admin's first save starts from, never read again after that.
//
// Trust boundary: server-read only. firestore.rules denies all client
// access in both directions — the client never needs the config itself,
// only the computed quote /api/quotes already returns.

import { getAdminDb } from "@/server/firebaseAdmin";
import {
  pricingConfigSchema,
  pricingConfigInputSchema,
  type PricingConfig,
  type PricingHistoryEntry,
} from "@/lib/schemas";

const CONFIG_DOC_PATH = ["config", "pricing"] as const;

/**
 * In-process cache with a short TTL. Vercel Fluid Compute reuses instances
 * across invocations, so without this every quote would cost a Firestore
 * read for a document that changes maybe a few times a year. Short enough
 * (30s) that a price change is visible on this instance almost immediately
 * even without the explicit invalidation below; that invalidation is what
 * actually makes "the next quote reflects it" true on the instance that
 * served the write, since different Fluid Compute instances don't share
 * this cache and would otherwise wait out the TTL.
 */
const CACHE_TTL_MS = 30_000;
let cache: { value: PricingConfig; fetchedAt: number } | null = null;

export function invalidatePricingConfigCache(): void {
  cache = null;
}

/**
 * Reads config/pricing, validated. Returns null if the document is missing
 * or fails validation — callers must treat null as "fail the quote with
 * 422", never as "fall back to a default". A malformed pricing document is
 * a louder, safer failure than silently pricing off stale constants (see
 * WM-101's Failure mode note).
 */
export async function getPricingConfig(): Promise<PricingConfig | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

  const db = getAdminDb();
  const snap = await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).get();
  if (!snap.exists) {
    // Distinct from the validation-failure log below (WM-104) — an operator
    // grepping logs for a total booking outage should immediately see which
    // of the two this is: never seeded (this line — see `pnpm run seed`) vs
    // seeded but corrupted (below, which needs manual repair, not a re-seed;
    // the seed script deliberately never touches a doc that already exists).
    console.error("config/pricing is missing — every quote will fail until it is seeded. Run `pnpm run seed`.");
    return null;
  }

  const parsed = pricingConfigSchema.safeParse(snap.data());
  if (!parsed.success) {
    console.error("config/pricing exists but failed validation — every quote will fail until it is repaired:", parsed.error.issues);
    return null;
  }

  cache = { value: parsed.data, fetchedAt: Date.now() };
  return parsed.data;
}

export type UpdatePricingConfigResult =
  | { ok: true; config: PricingConfig }
  | { ok: false; status: 400; error: string };

function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Validates an admin's naira-denominated form submission, converts to kobo,
 * writes config/pricing, and appends an audit entry to pricingHistory — all
 * in one transaction so the "before" snapshot in the history entry is
 * guaranteed consistent with whatever this write actually replaced, even if
 * two admins save concurrently.
 */
export async function updatePricingConfig(input: unknown, callerUid: string): Promise<UpdatePricingConfigResult> {
  const parsedInput = pricingConfigInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const first = parsedInput.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid pricing input.",
    };
  }
  const raw = parsedInput.data;

  const now = Date.now();
  const nextConfig: PricingConfig = {
    express: {
      baseKobo: nairaToKobo(raw.express.baseNaira),
      perKmKobo: nairaToKobo(raw.express.perKmNaira),
      minimumKobo: nairaToKobo(raw.express.minimumNaira),
    },
    standard: {
      baseKobo: nairaToKobo(raw.standard.baseNaira),
      perKmKobo: nairaToKobo(raw.standard.perKmNaira),
      minimumKobo: nairaToKobo(raw.standard.minimumNaira),
    },
    bulk: {
      baseKobo: nairaToKobo(raw.bulk.baseNaira),
      perKmKobo: nairaToKobo(raw.bulk.perKmNaira),
      minimumKobo: nairaToKobo(raw.bulk.minimumNaira),
    },
    roundingKobo: nairaToKobo(raw.roundingNaira),
    detourFactor: raw.detourFactor,
    maxTripKm: raw.maxTripKm,
    updatedAt: now,
    updatedBy: callerUid,
  };

  // Bounds validation on the resulting kobo values too, not just the naira
  // input — the input schema's ranges are naira-shaped and don't by
  // themselves guarantee e.g. minimumKobo >= baseKobo survives rounding at
  // the edges. Re-validating the actual document being written is what
  // "server-side bounds validation on write" in WM-101 means in practice.
  const parsedConfig = pricingConfigSchema.safeParse(nextConfig);
  if (!parsedConfig.success) {
    const first = parsedConfig.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: first ? `${first.path.join(".") || "config"}: ${first.message}` : "Computed pricing is invalid.",
    };
  }

  const db = getAdminDb();
  const configRef = db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]);
  const historyRef = db.collection("pricingHistory").doc();

  await db.runTransaction(async (tx) => {
    const beforeSnap = await tx.get(configRef);
    tx.set(configRef, parsedConfig.data);
    tx.set(historyRef, {
      before: beforeSnap.exists ? beforeSnap.data() : null,
      after: parsedConfig.data,
      changedBy: callerUid,
      changedAt: now,
    });
  });

  invalidatePricingConfigCache();
  return { ok: true, config: parsedConfig.data };
}

/** Most recent pricing changes, newest first, for the admin dashboard's audit list. */
export async function listPricingHistory(limit = 20): Promise<(PricingHistoryEntry & { id: string })[]> {
  const db = getAdminDb();
  const snap = await db.collection("pricingHistory").orderBy("changedAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PricingHistoryEntry) }));
}
