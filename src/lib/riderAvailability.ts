// Rider availability: where online riders are right now, so a new delivery
// can be matched to the nearest one. Separate from src/lib/tracking.ts, which
// publishes a rider's live position only *after* they're already assigned to
// a specific delivery — this covers the "looking for work" state before that.
//
// Firestore doesn't support native geoqueries, so positions are geohashed
// (geofire-common) and queried by bounding-box ranges, then filtered down to
// the actual radius client-side. This is a client-only app (no backend), so
// matching runs directly from whichever browser/device triggers it — see
// src/lib/dispatch.ts.

import {
  collection,
  deleteDoc,
  doc,
  endAt,
  getDocs,
  orderBy,
  query,
  setDoc,
  startAt,
} from "firebase/firestore";
import { geohashForLocation, geohashQueryBounds, distanceBetween, type Geopoint } from "geofire-common";
import { db } from "@/lib/firebase";
import { riderAvailabilitySchema, type RiderAvailability } from "@/lib/schemas";

const COLLECTION = "riderAvailability";

export type NearbyRider = RiderAvailability & { id: string; distanceKm: number };

/** Marks a rider online/busy at a given position. Called on a timer while online. */
export async function publishRiderAvailability(
  riderId: string,
  name: string,
  position: { lat: number; lng: number },
  status: "online" | "busy",
  vehicle?: string,
): Promise<void> {
  if (!db) return;
  const record: RiderAvailability = {
    riderId,
    name,
    ...(vehicle !== undefined ? { vehicle } : {}),
    lat: position.lat,
    lng: position.lng,
    geohash: geohashForLocation([position.lat, position.lng]),
    status,
    updatedAt: Date.now(),
  };
  const parsed = riderAvailabilitySchema.parse(record);
  await setDoc(doc(db, COLLECTION, riderId), parsed);
}

/** Removes a rider from the pool entirely — called when they go offline. */
export async function clearRiderAvailability(riderId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION, riderId));
}

/**
 * Online riders within `radiusKm` of `center`, nearest first. Riders whose
 * status isn't "online" (e.g. mid-delivery) are excluded — they're still in
 * the geohash bounds returned by Firestore but filtered out here rather than
 * via a composite index, since fleet size is small enough not to matter yet.
 */
export async function findNearbyOnlineRiders(
  center: Geopoint,
  radiusKm: number,
): Promise<NearbyRider[]> {
  if (!db) return [];
  const bounds = geohashQueryBounds(center, radiusKm * 1000);
  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      getDocs(query(collection(db!, COLLECTION), orderBy("geohash"), startAt(start), endAt(end))),
    ),
  );

  const seen = new Set<string>();
  const matches: NearbyRider[] = [];
  for (const snap of snapshots) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      const parsed = riderAvailabilitySchema.safeParse(docSnap.data());
      if (!parsed.success || parsed.data.status !== "online") continue;
      const distanceKm = distanceBetween([parsed.data.lat, parsed.data.lng], center);
      if (distanceKm <= radiusKm) {
        matches.push({ ...parsed.data, id: docSnap.id, distanceKm });
      }
    }
  }

  matches.sort((a, b) => a.distanceKm - b.distanceKm);
  return matches;
}
