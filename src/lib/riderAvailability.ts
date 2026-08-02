// Rider availability: where online riders are right now, so a new delivery
// can be matched to the nearest one. Separate from src/lib/tracking.ts, which
// publishes a rider's live position only *after* they're already assigned to
// a specific delivery — this covers the "looking for work" state before that.
//
// Reading this collection to find nearby riders now happens exclusively on
// the server (src/server/dispatch.ts) — no client code queries it, since
// riderAvailability is client-writable and was never trustworthy as a
// matching index. This module only publishes/clears the calling rider's own
// document.

import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import { db } from "@/lib/firebase";
import { riderAvailabilitySchema, type RiderAvailability } from "@/lib/schemas";

const COLLECTION = "riderAvailability";

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
