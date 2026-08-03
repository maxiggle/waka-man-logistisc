// Server-computed fare. The only source of truth for what a delivery costs
// is SERVICE_LEVEL_FARE_KOBO, keyed by service level.
//
// This function is pure and takes the *inputs* to a quote, not a delivery id,
// because it runs at booking time — before the delivery document exists.
// createDelivery (src/server/deliveries.ts) calls it once and stamps the
// result onto the delivery as `quotedAmountKobo`. Nothing re-prices a
// delivery after that: both payment paths (src/server/payments.ts) read the
// stored quote, so the number a customer was shown is the number they are
// charged, however long they take to pay and whatever the price table says
// by then.
//
// Distance pricing slots in here and nowhere else — the signature already
// carries both endpoints. See the note in dispatchConfig.ts.

import type { LatLng } from "@/lib/schemas";
import { SERVICE_LEVEL_FARE_KOBO, type ServiceLevel } from "@/lib/dispatchConfig";

/**
 * Integer kobo to charge for a delivery of `level` between these two points.
 *
 * `pickup`/`dropoff` are accepted but not yet priced on: fares are currently
 * flat per tier (W5-T1's deliberate minimal scope). They are in the signature
 * so that adding a per-km component is a change to this function alone,
 * rather than a change to every caller.
 */
export function quoteKobo(level: ServiceLevel, pickup: LatLng, dropoff: LatLng): number {
  void pickup;
  void dropoff;
  return SERVICE_LEVEL_FARE_KOBO[level];
}
