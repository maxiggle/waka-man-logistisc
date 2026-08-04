// Values that both the client (publishing availability, requesting a match)
// and the server (matching, claiming) must agree on. Keep this the single
// source of truth — do not re-declare any of these constants locally.

/** Minimum gap between availability writes to Firestore — cost guardrail. */
export const AVAILABILITY_PUBLISH_INTERVAL_MS = 8000;

/**
 * How long a rider's presence survives without a fresh publish. Reaching this
 * means the record is deleted and the rider is offline (see sweepStaleAvailability
 * in src/server/dispatch.ts).
 *
 * 30 minutes is a deliberate grace period, not the normal operating cadence:
 * with the foreground service running, a backgrounded rider still publishes every
 * AVAILABILITY_PUBLISH_INTERVAL_MS. This covers doze, a tunnel, an aggressive OEM
 * battery manager, or the app being killed — none of which should instantly
 * evict a rider who is still working.
 *
 * INVARIANT: AVAILABILITY_PUBLISH_INTERVAL_MS must stay well below this.
 */
export const AVAILABILITY_TTL_MS = 1_800_000; // 30 minutes

/**
 * How recent a rider's position must be for matching to consider them.
 *
 * Set equal to AVAILABILITY_TTL_MS on purpose: a present rider is an offerable
 * rider. The trade-off is that an offer can be built on a position up to 30
 * minutes old, which broadcast offers soften — every nearby rider is offered it
 * and can decline, and the pickup address is visible before accepting.
 *
 * Tighten this (e.g. 300_000) if stale-position offers become a problem in
 * practice. MUST NOT exceed AVAILABILITY_TTL_MS — a rider who cannot be matched
 * but still occupies a presence record is worse than being offline.
 */
export const AVAILABILITY_MATCH_FRESHNESS_MS = AVAILABILITY_TTL_MS;

/** Widest radius matching will search before giving up. */
export const MAX_SEARCH_RADIUS_KM = 50;

/**
 * A geocoded address further than this from the active service area's
 * centre is rejected outright rather than silently accepted (WM-102). Under
 * flat pricing a bad pin only misled matching; under distance pricing it
 * sets the price — a query like "Rumuigbo Rivers State" can resolve ~30 km
 * away in a different LGA and turn a ₦1,750 trip into a ₦4,500 one.
 *
 * Wider than MAX_TRIP_DISTANCE_KM on purpose: this bounds one endpoint's
 * distance from the area centre, not the trip length between two endpoints,
 * so it needs slack for a legitimate pickup and dropoff that are each far
 * from the centre but close to each other.
 */
export const MAX_GEOCODE_DISTANCE_FROM_AREA_KM = 40;

/** How long a rider has to accept before an offer lapses and the delivery returns to the pool. */
export const OFFER_TTL_MS = 30_000;

/**
 * Cap on how many riders a single delivery is offered to at once. Broadcast
 * fills faster than sequential offers, but every recipient is a document read
 * and a wasted tap for everyone who loses the race.
 */
export const MAX_OFFER_RECIPIENTS = 10;

/**
 * Per geohash-bound cap on the availability query in findEligibleRiders.
 * Without this, each of the ~9 bounding-box reads is unbounded and grows
 * with rider density. Note this trades accuracy for cost: a per-bound limit
 * gives nearest-within-each-cell, not a globally-nearest set across the
 * whole search radius — see the comment at the call site.
 */
export const MAX_RIDERS_PER_GEOHASH_BOUND = 50;

/**
 * Cap on how many nearby-candidate uids get a batched users/{uid} lookup in
 * findEligibleRiders. Without this, MAX_RIDERS_PER_GEOHASH_BOUND candidates
 * across all ~9 geohash bounds could mean hundreds of refs in one getAll()
 * call. Candidates are sorted nearest-first before the cap is applied, so
 * this only ever drops the farthest, least-likely-to-be-claimed riders.
 */
export const MAX_VEHICLE_LOOKUP_BATCH = 100;

/**
 * Cap on the pending-deliveries scan in matchNearestDelivery, ordered by
 * createdAt so the oldest waiting jobs are considered first — fairer than
 * arbitrary document order, and gives the cap a defensible meaning.
 */
export const MAX_PENDING_DELIVERIES_SCAN = 200;

/**
 * Cap on how many deliveries a single rider-side sweep will try to offer
 * before giving up. Each attempt is a full broadcastOffer — ~9 geohash range
 * queries plus a batched users lookup — so this is a hard bound on the work
 * one "go online" tap can trigger. Replaces MAX_CLAIM_ATTEMPTS, which capped
 * the same loop back when each attempt was a single two-document transaction.
 */
export const MAX_OFFER_ATTEMPTS = 5;

/**
 * Per-uid rate limit for POST /api/dispatch/match-delivery — a cheap call
 * that triggers a full pending-deliveries scan, so it's an easy cost-
 * amplification vector left unthrottled.
 */
export const MATCH_DELIVERY_RATE_LIMIT = 5;
export const MATCH_DELIVERY_RATE_WINDOW_MS = 10_000;

/** Rider vehicle types, matching riderSchema's enum in src/lib/schemas.ts. */
export type RiderVehicle = "bicycle" | "scooter" | "motorbike" | "car";

/** Delivery service levels, matching the `vehicle` keys in src/app/send/page.tsx. */
export type ServiceLevel = "standard" | "express" | "bulk";

/**
 * One mode of transport a rider can operate. Adding a mode is meant to be a
 * data change here and nowhere else: the registration picker, the client-facing
 * tier list, and matching eligibility are all derived from this registry.
 */
export interface TransportMode {
  /** Stable key persisted to users/{uid}.vehicle. Never rename an existing one. */
  readonly id: RiderVehicle;
  /** Shown in the rider registration picker. */
  readonly label: string;
  /**
   * Tiers this mode is physically capable of fulfilling. Capability-ordered: a
   * mode that can do a larger tier can also do every smaller one.
   */
  readonly serviceLevels: readonly ServiceLevel[];
  /**
   * Whether a NEW rider may register with this mode today. Operational switch,
   * not a capability one — flipping this to false does NOT change what an
   * existing rider of that mode is eligible for.
   */
  readonly available: boolean;
}

export const TRANSPORT_MODES: Record<RiderVehicle, TransportMode> = {
  // Express only. A motorbike is physically capable of a "standard" job
  // too, but claiming both here made "standard" bookable — BOOKABLE_SERVICE_LEVELS
  // is derived from what the available modes can fulfil — and put a second
  // tier in front of customers that resolves to the identical vehicle at a
  // lower price. There is one fleet; there should be one tier.
  //
  // Narrowing this also means motorbike riders are no longer eligible for
  // "standard" deliveries. Nothing can create one any more, but any that
  // predate this change are unmatchable.
  motorbike: { id: "motorbike", label: "Motorbike", serviceLevels: ["express"], available: true },
  bicycle: { id: "bicycle", label: "Bicycle", serviceLevels: ["standard"], available: false },
  scooter: { id: "scooter", label: "Scooter", serviceLevels: ["standard"], available: false },
  car: { id: "car", label: "Car", serviceLevels: ["standard", "express", "bulk"], available: false },
};

/** Modes a new rider can pick right now, in registry order. */
export const AVAILABLE_TRANSPORT_MODES: TransportMode[] = Object.values(TRANSPORT_MODES).filter(
  (m) => m.available,
);

/**
 * Tiers a client can actually book. A tier no available mode can fulfil would
 * leave the delivery "pending" forever with no rider ever eligible for it.
 * Derived, so setting `car.available = true` restores "bulk" on the booking
 * form automatically — no second edit.
 */
export const BOOKABLE_SERVICE_LEVELS: ServiceLevel[] = (["standard", "express", "bulk"] as const).filter(
  (level) => AVAILABLE_TRANSPORT_MODES.some((m) => m.serviceLevels.includes(level)),
);

/**
 * Which service levels each rider vehicle qualifies to fulfill. Riders with
 * no recorded vehicle (pre-Decision #4 legacy accounts) qualify for
 * "standard" only — callers should apply that fallback explicitly rather
 * than adding an entry here, since there's no vehicle key to look up.
 *
 * Capability-ordered: a vehicle that can do a larger/faster tier can also do
 * every smaller/slower one (a car can serve a bike job), so each entry is a
 * superset of the ones above it.
 *
 * Derived from TRANSPORT_MODES so capability can't drift from the registry.
 * Kept under the original name and shape — src/server/dispatch.ts consumes it
 * unchanged, and this deliberately covers every mode, available or not (a
 * rider already registered under a now-unavailable mode keeps qualifying for
 * exactly what that mode qualifies for).
 */
export const VEHICLE_ELIGIBILITY: Record<RiderVehicle, ServiceLevel[]> = Object.fromEntries(
  Object.values(TRANSPORT_MODES).map((m) => [m.id, [...m.serviceLevels]]),
) as Record<RiderVehicle, ServiceLevel[]>;

/**
 * Last-resort centre when no service area can be read from Firestore (empty
 * collection, offline, permission error). Admin-managed areas override this —
 * see serviceAreas/{id} and src/lib/serviceAreas.ts.
 */
export const FALLBACK_SERVICE_AREA = { name: "Port Harcourt", lat: 4.8156, lng: 7.0498 } as const;

/**
 * Per-tier distance pricing, in kobo (1 naira = 100 kobo — Paystack's
 * smallest unit).
 *
 * SEED VALUES ONLY (WM-101 Phase 2). quoteFor() (src/server/fare.ts) no
 * longer reads this table — it reads config/pricing
 * (src/server/pricingConfig.ts), the admin-editable document a superadmin
 * maintains via /admin/pricing. This table is consulted in exactly one
 * place now: pre-filling that dashboard's form the first time it's opened,
 * before config/pricing exists. Once an admin saves, this table is inert —
 * editing it does nothing to what customers are charged.
 *
 * fare = max(minimumKobo, baseKobo + perKmKobo × roadKm), then rounded up
 * to the configured rounding step (see computeFareKobo in
 * src/lib/pricingFormula.ts).
 *
 * standard/bulk are scaled from express by the same ratio the old flat
 * fares used (0.6× / 1.6×) — not measured, just carried forward so the
 * relative pricing between tiers doesn't jump. Expect rider rejections
 * until real seed values are tuned (see WM-101's Launch risk note).
 */
export const SERVICE_LEVEL_PRICING: Record<
  ServiceLevel,
  { baseKobo: number; perKmKobo: number; minimumKobo: number }
> = {
  // Calibrated against a real route and a real cost input rather than a
  // guess: Choba → Peter Odili is 7.59km of road (Mapbox Directions), and
  // the owner puts that trip at ₦3,500–4,000 with petrol at ₦1,350/litre.
  // These land it at ₦3,700.
  //
  // The split between base and per-km is not arbitrary. The base covers
  // what a rider spends regardless of trip length — riding to the pickup
  // unpaid, waiting, handover — and the per-km covers fuel and time on the
  // paid leg. At ₦1,350/litre and roughly 35km/litre in city traffic,
  // one-way fuel is about ₦39/km, and closer to ₦77/km once the rider's
  // return or repositioning leg is counted; ₦350/km leaves real headroom
  // above that for time, maintenance and margin as petrol moves.
  //
  // The minimum is deliberately a hair above one litre of petrol — the
  // shortest job worth accepting should still clear a tank top-up.
  express: { baseKobo: 100_000, perKmKobo: 35_000, minimumKobo: 150_000 },
  // Not bookable — no available transport mode claims either tier (see
  // TRANSPORT_MODES). Kept in proportion to express so that enabling a mode
  // doesn't silently expose a tier priced from a stale guess.
  standard: { baseKobo: 80_000, perKmKobo: 28_000, minimumKobo: 120_000 },
  bulk: { baseKobo: 160_000, perKmKobo: 56_000, minimumKobo: 240_000 },
};

/** Seed only (WM-101 Phase 2) — see SERVICE_LEVEL_PRICING. Charged amounts round up to the nearest rounding step. */
export const ROUNDING_KOBO = 5_000;

/**
 * Seed only (WM-101 Phase 2) — see SERVICE_LEVEL_PRICING. Multiplier
 * applied to straight-line (haversine) distance when Mapbox Directions
 * fails and quoteFor() falls back to it. Port Harcourt's creeks mean
 * great-circle distance systematically underpays relative to road distance
 * — measured at 1.43× on an ordinary cross-town trip — so this errs above
 * that rather than at 1.0.
 */
export const DETOUR_FACTOR = 1.5;

/**
 * Seed only (WM-101 Phase 2) — see SERVICE_LEVEL_PRICING. Trips longer than
 * this are refused at quote time (422), not left pending forever with no
 * rider able to serve them. Distinct from MAX_SEARCH_RADIUS_KM, which
 * bounds rider→pickup distance during matching, not pickup→dropoff trip
 * length.
 */
export const MAX_TRIP_DISTANCE_KM = 30;
