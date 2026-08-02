// Values that both the client (publishing availability, requesting a match)
// and the server (matching, claiming) must agree on. Keep this the single
// source of truth — do not re-declare any of these constants locally.

/** Minimum gap between availability writes to Firestore — cost guardrail. */
export const AVAILABILITY_PUBLISH_INTERVAL_MS = 8000;

/**
 * A riderAvailability doc older than this is treated as stale and excluded
 * from matching, even if never explicitly cleared (e.g. rider force-quit).
 *
 * INVARIANT: AVAILABILITY_PUBLISH_INTERVAL_MS must stay well below this TTL,
 * or live riders age out of the pool between publishes.
 */
export const AVAILABILITY_TTL_MS = 60_000;

/** Widest radius matching will search before giving up. */
export const MAX_SEARCH_RADIUS_KM = 50;

/** Stop retrying a match after this many failed claim attempts. */
export const MAX_CLAIM_ATTEMPTS = 10;

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
  motorbike: { id: "motorbike", label: "Motorbike", serviceLevels: ["standard", "express"], available: true },
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
