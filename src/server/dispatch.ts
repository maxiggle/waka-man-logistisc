// Server-side port of src/lib/dispatch.ts's matching logic, running on the
// Admin SDK so it can be trusted from an API route instead of whichever
// browser happens to trigger it. Differences from the client version:
//   1. TTL filter on availability records (safety net for force-quit riders).
//   2. Single query at MAX_SEARCH_RADIUS_KM instead of a progressive-radius
//      loop — geohash-bounds results are already distance-filtered/sorted
//      below, so re-scanning the same docs at each radius step is wasted work.
//   3. Vehicle-eligibility filter from dispatchConfig.
//   4. Matching offers rather than assigns — see the module doc below.
// src/lib/dispatch.ts stays live until Wave 3 cuts the client over.
//
// W4-T1: matching no longer assigns. It broadcasts an offer to every nearby
// eligible rider at once (offerDeliveryToRiders); only a rider's own accept
// (src/server/deliveryOffers.ts) ever writes status: "assigned". A rider who
// rejects is recorded in rejectedBy and never offered this delivery again.
// An offer nobody answers within OFFER_TTL_MS is swept back to "pending" by
// sweepExpiredOffers, called lazily at the top of both entry points below —
// there is no scheduler in this project, so an offer that lapses while the
// system is otherwise idle sits in "offered" (invisible to riders; the UI
// hides past-expiry offers) until the next booking or rider sweep tidies it.
import { geohashQueryBounds, distanceBetween, type Geopoint } from "geofire-common";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/server/firebaseAdmin";
import { riderAvailabilitySchema, serviceLevelSchema } from "@/lib/schemas";
import {
  AVAILABILITY_TTL_MS,
  AVAILABILITY_MATCH_FRESHNESS_MS,
  MAX_SEARCH_RADIUS_KM,
  MAX_RIDERS_PER_GEOHASH_BOUND,
  MAX_VEHICLE_LOOKUP_BATCH,
  MAX_PENDING_DELIVERIES_SCAN,
  MAX_OFFER_RECIPIENTS,
  MAX_OFFER_ATTEMPTS,
  OFFER_TTL_MS,
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

export type OfferResult = { deliveryId: string; offeredTo: string[] };

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

type AvailabilityCandidate = { id: string; name: string; lat: number; lng: number; distanceKm: number };

/**
 * Online, non-stale riders within MAX_SEARCH_RADIUS_KM of `pickup`, nearest
 * first — vehicle not yet resolved.
 *
 * Each bounding-box read is capped at MAX_RIDERS_PER_GEOHASH_BOUND. This is
 * an accuracy-for-cost trade: a per-bound limit gives nearest-within-each-
 * cell, not a true globally-nearest set across the whole search radius —
 * in a dense bound, a closer rider could be cut off if it sorts later than
 * the cap within that cell's arbitrary read order. Acceptable at today's
 * volume; revisit if that's ever the reported cause of a bad match.
 */
async function findNearbyOnlineCandidates(db: Firestore, pickup: Geopoint): Promise<AvailabilityCandidate[]> {
  const bounds = geohashQueryBounds(pickup, MAX_SEARCH_RADIUS_KM * 1000);
  const now = Date.now();

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      db
        .collection(AVAILABILITY_COLLECTION)
        .orderBy("geohash")
        .startAt(start)
        .endAt(end)
        .limit(MAX_RIDERS_PER_GEOHASH_BOUND)
        .get(),
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
      if (now - rider.updatedAt > AVAILABILITY_MATCH_FRESHNESS_MS) continue;

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

  // Sort nearest-first before capping the getAll() fan-out — with
  // MAX_RIDERS_PER_GEOHASH_BOUND candidates across ~9 geohash bounds, an
  // uncapped batch could mean hundreds of refs in one call. This only ever
  // drops the farthest, least-likely-to-be-claimed candidates.
  const nearest = candidates
    .slice()
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_VEHICLE_LOOKUP_BATCH);

  const userSnaps = await db.getAll(...nearest.map((c) => db.collection("users").doc(c.id)));
  const vehicleByUid = new Map<string, string | undefined>();
  userSnaps.forEach((snap, i) => {
    // Missing user document (deleted account, bad data) is treated as
    // no-vehicle — standard-only — not skipped and not a crash.
    const data = snap.exists ? snap.data() : undefined;
    vehicleByUid.set(nearest[i].id, typeof data?.vehicle === "string" ? data.vehicle : undefined);
  });

  // `nearest` is already distance-sorted (that's the whole point of the
  // slice above) and filter/map preserve order, so the result needs no
  // further sort.
  return nearest
    .filter((c) => isEligible(vehicleByUid.get(c.id), serviceLevel))
    .map((c) => ({ ...c, vehicle: vehicleByUid.get(c.id) }));
}

/**
 * Broadcasts an offer for `deliveryId` to `candidateUids` (nearest-first,
 * already vehicle-eligible and online at search time). Re-asserts inside the
 * transaction that the delivery still exists, has no riderId, and is still
 * "pending" — same discipline tryClaimDelivery used to apply for a direct
 * assignment. Does NOT touch rider availability: riders stay "online" while
 * an offer is outstanding, since they have not committed to anything yet —
 * only acceptance (src/server/deliveryOffers.ts) makes a rider "busy".
 *
 * Candidates already in the delivery's rejectedBy are excluded here (not
 * upstream in the geo search) because rejectedBy lives on the delivery
 * document, read fresh inside this same transaction. The result is capped at
 * MAX_OFFER_RECIPIENTS after that filter, so a delivery rejected by some of
 * its nearest candidates still reaches a full recipient list from the rest.
 */
async function offerDeliveryToRiders(deliveryId: string, candidateUids: string[]): Promise<OfferResult | null> {
  const db = getAdminDb();
  try {
    return await db.runTransaction(async (tx) => {
      const deliveryRef = db.collection(DELIVERIES_COLLECTION).doc(deliveryId);
      const deliverySnap = await tx.get(deliveryRef);

      if (!deliverySnap.exists) return null;
      const data = deliverySnap.data()!;
      if (data.riderId) return null;
      // The route's pre-transaction status check leaves a window: the
      // delivery could change state between that read and this transaction.
      // Re-assert it's still pending here, inside the atomic section.
      if (data.status !== "pending") return null;

      const rejectedBy: string[] = Array.isArray(data.rejectedBy) ? data.rejectedBy : [];
      const offeredTo = candidateUids.filter((uid) => !rejectedBy.includes(uid)).slice(0, MAX_OFFER_RECIPIENTS);
      if (offeredTo.length === 0) return null;

      const offeredAt = Date.now();
      tx.update(deliveryRef, {
        status: "offered",
        offeredTo,
        offeredAt,
        offerExpiresAt: offeredAt + OFFER_TTL_MS,
      });
      return { deliveryId, offeredTo };
    });
  } catch (err) {
    console.error(`Failed to offer delivery ${deliveryId}:`, err);
    return null;
  }
}

/**
 * Finds every eligible online rider near `pickup` and broadcasts an offer to
 * all of them at once (capped at MAX_OFFER_RECIPIENTS). Shared by both
 * matching directions below, so a delivery a rider's own sweep discovers is
 * still offered to every other eligible rider nearby, not just that one.
 */
async function broadcastOffer(
  deliveryId: string,
  pickup: Geopoint,
  serviceLevel: ServiceLevel,
): Promise<OfferResult | null> {
  const candidates = await findEligibleRiders(pickup, serviceLevel);
  if (candidates.length === 0) return null;
  return offerDeliveryToRiders(
    deliveryId,
    candidates.map((c) => c.id),
  );
}

/**
 * Returns "offered" deliveries whose offer has lapsed back to "pending",
 * clearing offeredTo/offeredAt/offerExpiresAt but keeping rejectedBy. There
 * is no scheduler in this project, so this runs lazily at the top of both
 * matching entry points rather than on a timer — an offer that lapses while
 * nothing else happens in the system sits in "offered" until the next
 * booking or rider sweep runs this. That is harmless: it is invisible to
 * riders (the UI hides past-expiry offers) and not lost, just untidy.
 *
 * Capped the same way MAX_PENDING_DELIVERIES_SCAN caps the pending scan.
 */
async function sweepExpiredOffers(): Promise<void> {
  const db = getAdminDb();
  const now = Date.now();
  const snap = await db
    .collection(DELIVERIES_COLLECTION)
    .where("status", "==", "offered")
    .limit(MAX_PENDING_DELIVERIES_SCAN)
    .get();

  const expired = snap.docs.filter((docSnap) => {
    const expiresAt = docSnap.data().offerExpiresAt;
    return typeof expiresAt === "number" && expiresAt < now;
  });
  if (expired.length === 0) return;

  await Promise.all(
    expired.map(async (docSnap) => {
      const ref = docSnap.ref;
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if (!fresh.exists) return;
          const data = fresh.data()!;
          // Re-check inside the transaction: another sweep, or the rider
          // accepting/rejecting, may have already moved this delivery on.
          if (data.status !== "offered") return;
          const expiresAt = data.offerExpiresAt;
          if (typeof expiresAt !== "number" || expiresAt >= Date.now()) return;

          tx.update(ref, {
            status: "pending",
            offeredTo: [],
            offeredAt: null,
            offerExpiresAt: null,
          });
        });
      } catch (err) {
        console.error(`Failed to sweep expired offer ${ref.id}:`, err);
      }
    }),
  );
}

/**
 * Deletes riderAvailability records that have gone stale — updatedAt older
 * than AVAILABILITY_TTL_MS, or missing/invalid entirely. Same lazy pattern as
 * sweepExpiredOffers: no scheduler in this project, so a record that ages out
 * while nothing else happens survives until the next booking or rider sweep.
 * Harmless in the meantime — matching already ignores it via
 * AVAILABILITY_MATCH_FRESHNESS_MS — just untidy.
 *
 * A rider who is "busy" on an active delivery and whose app dies will have
 * their record swept after AVAILABILITY_TTL_MS too. That's fine:
 * completeDelivery and advanceDeliveryStatus (src/server/deliveryLifecycle.ts)
 * both guard their availability writes with `if (availabilitySnap.exists)`,
 * so the delivery still completes — the rider just has no presence record
 * until they go online again.
 *
 * Capped the same way MAX_PENDING_DELIVERIES_SCAN caps the pending scan.
 */
async function sweepStaleAvailability(): Promise<void> {
  const db = getAdminDb();
  const now = Date.now();
  const snap = await db.collection(AVAILABILITY_COLLECTION).limit(MAX_PENDING_DELIVERIES_SCAN).get();

  const stale = snap.docs.filter((docSnap) => {
    const updatedAt = docSnap.data().updatedAt;
    return typeof updatedAt !== "number" || now - updatedAt > AVAILABILITY_TTL_MS;
  });
  if (stale.length === 0) return;

  await Promise.all(
    stale.map(async (docSnap) => {
      const ref = docSnap.ref;
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if (!fresh.exists) return;
          const updatedAt = fresh.data()!.updatedAt;
          // Re-check inside the transaction: the rider may have published in
          // the intervening moment, and a fresh publish must not be evicted.
          if (typeof updatedAt === "number" && Date.now() - updatedAt <= AVAILABILITY_TTL_MS) return;
          tx.delete(ref);
        });
      } catch (err) {
        console.error(`Failed to sweep stale availability ${ref.id}:`, err);
      }
    }),
  );
}

/** Finds every eligible online rider for a freshly created delivery and offers it to all of them at once. */
export async function matchNearestRider(
  deliveryId: string,
  pickup: Geopoint,
  serviceLevel: ServiceLevel,
): Promise<OfferResult | null> {
  await Promise.all([sweepExpiredOffers(), sweepStaleAvailability()]);
  return broadcastOffer(deliveryId, pickup, serviceLevel);
}

/**
 * Finds the nearest still-pending, vehicle-eligible delivery for a rider who
 * just came online, and broadcasts an offer for it to every eligible online
 * rider nearby — not only the rider who triggered this sweep. Pending
 * deliveries have no location index of their own (small volume expected), so
 * this scans them directly.
 *
 * Capped at MAX_PENDING_DELIVERIES_SCAN, oldest-first by createdAt — fairer
 * than arbitrary document order, and gives the cap a defensible meaning
 * (the longest-waiting jobs are the ones considered).
 */
export async function matchNearestDelivery(rider: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicle?: string;
}): Promise<OfferResult | null> {
  await Promise.all([sweepExpiredOffers(), sweepStaleAvailability()]);

  const db = getAdminDb();
  const snap = await db
    .collection(DELIVERIES_COLLECTION)
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc")
    .limit(MAX_PENDING_DELIVERIES_SCAN)
    .get();
  if (snap.empty) return null;

  const center: Geopoint = [rider.lat, rider.lng];
  const candidates = snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const pickup =
        data.pickup && typeof data.pickup.lat === "number" && typeof data.pickup.lng === "number"
          ? { lat: data.pickup.lat, lng: data.pickup.lng }
          : null;
      // Missing vehicle field defaults to "standard" — same convention as
      // match-rider/route.ts, so the two matching directions can't disagree
      // about what an absent tier means. A present-but-invalid tier is a
      // different case — excluded outright below, not defaulted.
      const parsedLevel = serviceLevelSchema.safeParse(data.vehicle ?? "standard");
      if (data.vehicle !== undefined && !parsedLevel.success) {
        console.error(`Delivery ${docSnap.id} has an invalid service level, excluding from matching:`, data.vehicle);
      }
      const invalidLevel = data.vehicle !== undefined && !parsedLevel.success;
      const serviceLevel: ServiceLevel | undefined = parsedLevel.success ? parsedLevel.data : undefined;
      const releasedBy = typeof data.releasedBy === "string" ? data.releasedBy : undefined;
      const rejectedBy: string[] = Array.isArray(data.rejectedBy) ? data.rejectedBy : [];
      return { id: docSnap.id, pickup, serviceLevel, invalidLevel, releasedBy, rejectedBy };
    })
    .filter(
      (
        d,
      ): d is {
        id: string;
        pickup: { lat: number; lng: number };
        serviceLevel: ServiceLevel | undefined;
        invalidLevel: boolean;
        releasedBy: string | undefined;
        rejectedBy: string[];
      } => d.pickup !== null,
    )
    // A rider who just released this job shouldn't get it back on their
    // very next sweep — they're still online and nearby, so without this
    // it bounces straight back to them instead of anyone else getting a
    // chance at it.
    .filter((d) => d.releasedBy !== rider.id)
    // A rider who already rejected this delivery is never offered it again.
    .filter((d) => !d.rejectedBy.includes(rider.id))
    .filter((d) => !d.invalidLevel && d.serviceLevel !== undefined && isEligible(rider.vehicle, d.serviceLevel))
    .map((d) => ({
      id: d.id,
      pickup: d.pickup,
      serviceLevel: d.serviceLevel!,
      distanceKm: distanceBetween(center, [d.pickup.lat, d.pickup.lng]),
    }))
    // Same radius the other direction already applies: matchNearestRider only
    // considers riders within MAX_SEARCH_RADIUS_KM of the pickup, so a delivery
    // beyond it would never be offered to this rider from that side either.
    // Sorting alone left these on the list — they just sorted last, and were
    // still attempted once everything nearer had failed.
    .filter((d) => d.distanceKm <= MAX_SEARCH_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Backstop for the case the distance filter cannot cover: several nearby
  // deliveries, but no other eligible rider near any of their pickups.
  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_OFFER_ATTEMPTS) break;
    attempts++;
    const result = await broadcastOffer(candidate.id, [candidate.pickup.lat, candidate.pickup.lng], candidate.serviceLevel);
    if (result) return result;
  }
  return null;
}
