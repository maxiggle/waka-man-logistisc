// Nearest-rider matching. Two entry points feed the same claim logic:
//   1. matchNearestRider    — run right after a client requests a delivery.
//   2. matchNearestDelivery — run right after a rider goes online, so a
//      request made while nobody was online still gets picked up once
//      someone is.
// There's no backend here (static Vercel deploy, client SDK only), so
// "dispatch" just means whichever browser triggers one of these functions
// runs the query and the claim transaction itself. That's the same trust
// model as the rest of this app today (see firestore.rules.admin-invites) —
// a malicious client could in principle claim jobs for a rider it doesn't
// control. Fine for now; revisit if that becomes a real abuse vector.

import { doc, runTransaction } from "firebase/firestore";
import { distanceBetween, type Geopoint } from "geofire-common";
import { db } from "@/lib/firebase";
import { findNearbyOnlineRiders, type NearbyRider } from "@/lib/riderAvailability";
import { getPendingDeliveries, type PendingDelivery } from "@/lib/deliveryQueue";

/** Progressively widened search radii, in km, before giving up. */
const SEARCH_RADII_KM = [3, 8, 20, 50];

/** The minimal rider identity needed to claim a job — either a matched candidate or the rider themself. */
export type RiderRef = { id: string; name: string; lat: number; lng: number; vehicle?: string };

/**
 * Atomically assigns `riderId` to `deliveryId`, but only if the delivery is
 * still unassigned and the rider is still online — protects against two
 * clients racing to claim the same job, or a rider going offline mid-match.
 */
async function tryClaimDelivery(deliveryId: string, rider: RiderRef): Promise<boolean> {
  if (!db) return false;
  try {
    return await runTransaction(db, async (tx) => {
      const deliveryRef = doc(db!, "deliveries", deliveryId);
      const riderRef = doc(db!, "riderAvailability", rider.id);
      const [deliverySnap, riderSnap] = await Promise.all([tx.get(deliveryRef), tx.get(riderRef)]);

      if (!deliverySnap.exists() || deliverySnap.data().riderId) return false;
      const riderData = riderSnap.data();
      if (!riderSnap.exists() || riderData?.status !== "online") return false;

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

/** Finds and claims the nearest online rider for a freshly created delivery. */
export async function matchNearestRider(deliveryId: string, pickup: Geopoint): Promise<NearbyRider | null> {
  const tried = new Set<string>();
  for (const radiusKm of SEARCH_RADII_KM) {
    const candidates = await findNearbyOnlineRiders(pickup, radiusKm);
    for (const candidate of candidates) {
      if (tried.has(candidate.id)) continue;
      tried.add(candidate.id);
      if (await tryClaimDelivery(deliveryId, candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Finds and claims the nearest still-pending delivery for a rider who just
 * came online. Pending deliveries have no location index of their own (small
 * volume expected), so this scans them directly rather than geohashing.
 */
export async function matchNearestDelivery(rider: RiderRef): Promise<PendingDelivery | null> {
  const pending = await getPendingDeliveries();
  if (pending.length === 0) return null;

  const center: Geopoint = [rider.lat, rider.lng];
  const withDistance = pending
    .filter((d) => d.pickup)
    .map((d) => ({ delivery: d, distanceKm: distanceBetween(center, [d.pickup!.lat, d.pickup!.lng]) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  for (const { delivery } of withDistance) {
    if (await tryClaimDelivery(delivery.id, rider)) return delivery;
  }
  return null;
}
