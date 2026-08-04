// Server-computed, distance-based fare (WM-101). The only source of truth
// for what a delivery costs is quoteFor() below — it is the sole place
// road distance and config/pricing (src/server/pricingConfig.ts) are turned
// into money.
//
// quoteFor() runs at quote time (src/server/quotes.ts), before any delivery
// document exists — src/server/deliveries.ts never re-prices, it reads a
// previously created quotes/{id} doc back and freezes that number onto the
// delivery. So the number a customer was shown is the number they are
// charged, however long they take to pay and whatever this function would
// return by then.

import { distanceBetween, type Geopoint } from "geofire-common";
import type { LatLng } from "@/lib/schemas";
import type { ServiceLevel } from "@/lib/dispatchConfig";
import { computeFareKobo } from "@/lib/pricingFormula";
import { getPricingConfig } from "@/server/pricingConfig";
import { MAPBOX_TOKEN, hasMapbox } from "@/lib/mapbox";

export type FareBasis = "road" | "straight_line_fallback";

export type QuoteResult =
  | {
      ok: true;
      amountKobo: number;
      distanceMeters: number;
      durationSeconds: number | null;
      basis: FareBasis;
    }
  | { ok: false; reason: "too_far"; distanceMeters: number }
  | { ok: false; reason: "unpriced" };

/** Straight-line distance in meters, via the same haversine geofire-common already uses for matching. */
function haversineMeters(a: LatLng, b: LatLng): number {
  const pointA: Geopoint = [a.lat, a.lng];
  const pointB: Geopoint = [b.lat, b.lng];
  return distanceBetween(pointA, pointB) * 1000;
}

/**
 * Mapbox Directions (driving profile) distance/duration for pickup→dropoff,
 * or null on any failure (no token, network error, non-2xx, no route) —
 * callers fall back to haversine rather than failing the booking.
 */
async function roadDistance(
  pickup: LatLng,
  dropoff: LatLng,
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  if (!hasMapbox()) return null;
  try {
    const coords = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const route = data?.routes?.[0];
    if (typeof route?.distance !== "number" || typeof route?.duration !== "number") return null;
    return { distanceMeters: route.distance, durationSeconds: route.duration };
  } catch (err) {
    console.error("Mapbox Directions request failed:", err);
    return null;
  }
}

/**
 * Prices a `level` delivery between `pickup` and `dropoff`, against
 * config/pricing (src/server/pricingConfig.ts) — never a code default; a
 * missing or invalid config fails the quote (`reason: "unpriced"`) rather
 * than silently pricing off stale constants (WM-101 Phase 2's Failure mode
 * requirement).
 *
 * Distance comes from Mapbox Directions (road distance) when available,
 * falling back to haversine × config.detourFactor on any Directions
 * failure — recorded on the result as `basis` so it's possible to tell how
 * often the fallback fires.
 *
 * Trips beyond config.maxTripKm are refused here, at quote time, rather
 * than producing a delivery nothing can ever be matched to serve.
 */
export async function quoteFor(level: ServiceLevel, pickup: LatLng, dropoff: LatLng): Promise<QuoteResult> {
  const config = await getPricingConfig();
  if (!config) return { ok: false, reason: "unpriced" };

  const road = await roadDistance(pickup, dropoff);
  const distanceMeters = road ? road.distanceMeters : haversineMeters(pickup, dropoff) * config.detourFactor;
  const durationSeconds = road ? road.durationSeconds : null;
  const basis: FareBasis = road ? "road" : "straight_line_fallback";

  if (distanceMeters / 1000 > config.maxTripKm) {
    return { ok: false, reason: "too_far", distanceMeters };
  }

  const amountKobo = computeFareKobo(config[level], config.roundingKobo, distanceMeters / 1000);

  return { ok: true, amountKobo, distanceMeters, durationSeconds, basis };
}
