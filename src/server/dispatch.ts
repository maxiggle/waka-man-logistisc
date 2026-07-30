// Server-side port of src/lib/dispatch.ts's matching logic, running on the
// Admin SDK so it can be trusted from an API route instead of whichever
// browser happens to trigger it. Four differences from the client version:
//   1. TTL filter on availability records (safety net for force-quit riders).
//   2. Single query at MAX_SEARCH_RADIUS_KM instead of a progressive-radius
//      loop — geohash-bounds results are already distance-filtered/sorted
//      below, so re-scanning the same docs at each radius step is wasted work.
//   3. Vehicle-eligibility filter from dispatchConfig.
//   4. Capped claim attempts.
// src/lib/dispatch.ts stays live until Wave 3 cuts the client over.
import { geohashQueryBounds, distanceBetween, type Geopoint } from "geofire-common";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/server/firebaseAdmin";
import { riderAvailabilitySchema, serviceLevelSchema } from "@/lib/schemas";
import {
  AVAILABILITY_TTL_MS,
  MAX_SEARCH_RADIUS_KM,
  MAX_CLAIM_ATTEMPTS,
  VEHICLE_ELIGIBILITY,
  type ServiceLevel,
  type RiderVehicle,
} from "@/lib/dispatchConfig";

const AVAILABILITY_COLLECTION = "riderAvailability";
const DELIVERIES_COLLECTION = "deliveries";

export type RiderCandidate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicle?: string;
  distanceKm: number;
};

export type DeliveryCandidate = {
  id: string;
  distanceKm: number;
};

/**
 * Riders with no recorded vehicle (Decision #4 legacy accounts) qualify for
 * "standard" only. An unrecognized vehicle string qualifies for nothing —
 * this is looked up against the server-trusted users/{uid} document now,
 * but stays strict on principle: a garbage value should never earn work.
 */
function isEligible(vehicle: string | undefined, serviceLevel: ServiceLevel): boolean {
  if (!vehicle) return serviceLevel === "standard";
  const levels = VEHICLE_ELIGIBILITY[vehicle as RiderVehicle];
  if (!levels) return false;
  return levels.includes(serviceLevel);
}

function initialsFor(name: string): string {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "WM"
  );
}

type AvailabilityCandidate = { id: string; name: string; lat: number; lng: number; distanceKm: number };

/** Online, non-stale riders within MAX_SEARCH_RADIUS_KM of `pickup`, nearest first — vehicle not yet resolved. */
async function findNearbyOnlineCandidates(db: Firestore, pickup: Geopoint): Promise<AvailabilityCandidate[]> {
  const bounds = geohashQueryBounds(pickup, MAX_SEARCH_RADIUS_KM * 1000);
  const now = Date.now();

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      db.collection(AVAILABILITY_COLLECTION).orderBy("geohash").startAt(start).endAt(end).get(),
    ),
  );

  const seen = new Set<string>();
  const candidates: AvailabilityCandidate[] = [];
  for (const snap of snapshots) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      if (!docSnap.exists) continue;

      const parsed = riderAvailabilitySchema.safeParse(docSnap.data());
      if (!parsed.success) continue;
      const rider = parsed.data;

      if (rider.status !== "online") continue;
      if (now - rider.updatedAt > AVAILABILITY_TTL_MS) continue;

      const distanceKm = distanceBetween([rider.lat, rider.lng], pickup);
      if (distanceKm > MAX_SEARCH_RADIUS_KM) continue;

      candidates.push({ id: docSnap.id, name: rider.name, lat: rider.lat, lng: rider.lng, distanceKm });
    }
  }

  return candidates;
}

/**
 * Online, non-stale, vehicle-eligible riders within MAX_SEARCH_RADIUS_KM of
 * `pickup`, nearest first. Vehicle is resolved from each candidate's
 * server-trusted users/{uid} document — never from riderAvailability, which
 * is client-writable (a rider could otherwise self-declare "car" and take
 * bulk-tier jobs). Lookups are batched with getAll() rather than one get()
 * per candidate.
 */
async function findEligibleRiders(pickup: Geopoint, serviceLevel: ServiceLevel): Promise<RiderCandidate[]> {
  const db = getAdminDb();
  const candidates = await findNearbyOnlineCandidates(db, pickup);
  if (candidates.length === 0) return [];

  const userSnaps = await db.getAll(...candidates.map((c) => db.collection("users").doc(c.id)));
  const vehicleByUid = new Map<string, string | undefined>();
  userSnaps.forEach((snap, i) => {
    // Missing user document (deleted account, bad data) is treated as
    // no-vehicle — standard-only — not skipped and not a crash.
    const data = snap.exists ? snap.data() : undefined;
    vehicleByUid.set(candidates[i].id, typeof data?.vehicle === "string" ? data.vehicle : undefined);
  });

  const matches: RiderCandidate[] = candidates
    .filter((c) => isEligible(vehicleByUid.get(c.id), serviceLevel))
    .map((c) => ({ ...c, vehicle: vehicleByUid.get(c.id) }));

  matches.sort((a, b) => a.distanceKm - b.distanceKm);
  return matches;
}

/**
 * Atomically assigns `riderId` to `deliveryId`, but only if the delivery is
 * still unassigned and the rider is still online. Existence is checked
 * before reading each snapshot's data (the client version in
 * src/lib/dispatch.ts does this backwards for the rider snapshot).
 */
async function tryClaimDelivery(
  deliveryId: string,
  rider: { id: string; name: string; vehicle?: string },
): Promise<boolean> {
  const db = getAdminDb();
  try {
    return await db.runTransaction(async (tx) => {
      const deliveryRef = db.collection(DELIVERIES_COLLECTION).doc(deliveryId);
      const riderRef = db.collection(AVAILABILITY_COLLECTION).doc(rider.id);
      const [deliverySnap, riderSnap] = await tx.getAll(deliveryRef, riderRef);

      if (!deliverySnap.exists) return false;
      const deliveryData = deliverySnap.data();
      if (deliveryData?.riderId) return false;
      // The route's pre-transaction status check leaves a window: the
      // delivery could be cancelled between that read and this transaction.
      // Re-assert it's still pending here, inside the atomic section.
      if (deliveryData?.status !== "pending") return false;

      if (!riderSnap.exists) return false;
      if (riderSnap.data()?.status !== "online") return false;

      tx.update(riderRef, { status: "busy", updatedAt: Date.now() });
      tx.update(deliveryRef, {
        riderId: rider.id,
        rider: {
          name: rider.name,
          initials: initialsFor(rider.name),
          vehicle: rider.vehicle ?? null,
        },
        status: "assigned",
        assignedAt: Date.now(),
      });
      return true;
    });
  } catch (err) {
    console.error(`Failed to claim delivery ${deliveryId} for rider ${rider.id}:`, err);
    return false;
  }
}

/** Finds and claims the nearest eligible online rider for a freshly created delivery. */
export async function matchNearestRider(
  deliveryId: string,
  pickup: Geopoint,
  serviceLevel: ServiceLevel,
): Promise<RiderCandidate | null> {
  const candidates = await findEligibleRiders(pickup, serviceLevel);
  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_CLAIM_ATTEMPTS) break;
    attempts++;
    if (await tryClaimDelivery(deliveryId, candidate)) return candidate;
  }
  return null;
}

/**
 * Finds and claims the nearest still-pending, vehicle-eligible delivery for
 * a rider who just came online. Pending deliveries have no location index of
 * their own (small volume expected), so this scans them directly.
 */
export async function matchNearestDelivery(rider: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicle?: string;
}): Promise<DeliveryCandidate | null> {
  const db = getAdminDb();
  const snap = await db.collection(DELIVERIES_COLLECTION).where("status", "==", "pending").get();
  if (snap.empty) return null;

  const center: Geopoint = [rider.lat, rider.lng];
  const candidates = snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const pickup =
        data.pickup && typeof data.pickup.lat === "number" && typeof data.pickup.lng === "number"
          ? { lat: data.pickup.lat, lng: data.pickup.lng }
          : null;
      // undefined vehicle = no tier recorded on the delivery, open to any
      // vehicle (existing behavior). A present-but-invalid tier is a
      // different case — excluded outright below rather than silently
      // treated as "open" or matched against a wrong tier.
      const parsedLevel = serviceLevelSchema.safeParse(data.vehicle);
      if (data.vehicle !== undefined && !parsedLevel.success) {
        console.error(`Delivery ${docSnap.id} has an invalid service level, excluding from matching:`, data.vehicle);
      }
      const invalidLevel = data.vehicle !== undefined && !parsedLevel.success;
      const serviceLevel: ServiceLevel | undefined = parsedLevel.success ? parsedLevel.data : undefined;
      return { id: docSnap.id, pickup, serviceLevel, invalidLevel };
    })
    .filter(
      (d): d is { id: string; pickup: { lat: number; lng: number }; serviceLevel: ServiceLevel | undefined; invalidLevel: boolean } =>
        d.pickup !== null,
    )
    .filter((d) => !d.invalidLevel && (!d.serviceLevel || isEligible(rider.vehicle, d.serviceLevel)))
    .map((d) => ({ id: d.id, distanceKm: distanceBetween(center, [d.pickup.lat, d.pickup.lng]) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_CLAIM_ATTEMPTS) break;
    attempts++;
    if (await tryClaimDelivery(candidate.id, rider)) return candidate;
  }
  return null;
}
