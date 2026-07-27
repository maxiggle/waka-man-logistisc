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

/** Rider vehicle types, matching riderSchema's enum in src/lib/schemas.ts. */
export type RiderVehicle = "bicycle" | "scooter" | "motorbike" | "car";

/** Delivery service levels, matching the `vehicle` keys in src/app/send/page.tsx. */
export type ServiceLevel = "standard" | "express" | "bulk";

/**
 * Which service levels each rider vehicle qualifies to fulfill. Riders with
 * no recorded vehicle (pre-Decision #4 legacy accounts) qualify for
 * "standard" only — callers should apply that fallback explicitly rather
 * than adding an entry here, since there's no vehicle key to look up.
 *
 * Capability-ordered: a vehicle that can do a larger/faster tier can also do
 * every smaller/slower one (a car can serve a bike job), so each entry is a
 * superset of the ones above it.
 */
export const VEHICLE_ELIGIBILITY: Record<RiderVehicle, ServiceLevel[]> = {
  // Product decision, not a code fix: the "standard" tier's UI copy reads
  // "Scooter · pickup in ~9 min", which a bicycle rider won't meet. Revisit
  // the copy or split the tier — out of scope here.
  bicycle: ["standard"],
  scooter: ["standard"],
  motorbike: ["standard", "express"],
  car: ["standard", "express", "bulk"],
};
