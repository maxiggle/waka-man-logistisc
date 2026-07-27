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
import { adminDb } from "@/server/firebaseAdmin";
import { riderAvailabilitySchema } from "@/lib/schemas";
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

/** Riders with no recorded vehicle (Decision #4 legacy accounts) qualify for "standard" only. */
function isEligible(vehicle: string | undefined, serviceLevel: ServiceLevel): boolean {
  if (!vehicle) return serviceLevel === "standard";
  const levels = VEHICLE_ELIGIBILITY[vehicle as RiderVehicle];
  return levels ? levels.includes(serviceLevel) : serviceLevel === "standard";
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

/** Online, non-stale, vehicle-eligible riders within MAX_SEARCH_RADIUS_KM of `pickup`, nearest first. */
async function findEligibleRiders(pickup: Geopoint, serviceLevel: ServiceLevel): Promise<RiderCandidate[]> {
  const bounds = geohashQueryBounds(pickup, MAX_SEARCH_RADIUS_KM * 1000);
  const now = Date.now();

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      adminDb.collection(AVAILABILITY_COLLECTION).orderBy("geohash").startAt(start).endAt(end).get(),
    ),
  );

  const seen = new Set<string>();
  const matches: RiderCandidate[] = [];
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
      if (!isEligible(rider.vehicle, serviceLevel)) continue;

      const distanceKm = distanceBetween([rider.lat, rider.lng], pickup);
      if (distanceKm > MAX_SEARCH_RADIUS_KM) continue;

      matches.push({ id: docSnap.id, name: rider.name, lat: rider.lat, lng: rider.lng, vehicle: rider.vehicle, distanceKm });
    }
  }

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
  try {
    return await adminDb.runTransaction(async (tx) => {
      const deliveryRef = adminDb.collection(DELIVERIES_COLLECTION).doc(deliveryId);
      const riderRef = adminDb.collection(AVAILABILITY_COLLECTION).doc(rider.id);
      const [deliverySnap, riderSnap] = await Promise.all([tx.get(deliveryRef), tx.get(riderRef)]);

      if (!deliverySnap.exists) return false;
      if (deliverySnap.data()?.riderId) return false;

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
  const snap = await adminDb.collection(DELIVERIES_COLLECTION).where("status", "==", "pending").get();
  if (snap.empty) return null;

  const center: Geopoint = [rider.lat, rider.lng];
  const candidates = snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const pickup =
        data.pickup && typeof data.pickup.lat === "number" && typeof data.pickup.lng === "number"
          ? { lat: data.pickup.lat, lng: data.pickup.lng }
          : null;
      const serviceLevel: ServiceLevel | undefined =
        typeof data.vehicle === "string" ? (data.vehicle as ServiceLevel) : undefined;
      return { id: docSnap.id, pickup, serviceLevel };
    })
    .filter((d): d is { id: string; pickup: { lat: number; lng: number }; serviceLevel: ServiceLevel | undefined } => d.pickup !== null)
    .filter((d) => !d.serviceLevel || isEligible(rider.vehicle, d.serviceLevel))
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
