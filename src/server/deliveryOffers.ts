// Server-side accept/reject for a broadcast delivery offer (W4-T1). A
// delivery is never assigned by matching (src/server/dispatch.ts) — matching
// only writes status: "offered" and a list of eligible uids. Assignment
// happens exclusively here, when a rider in that list accepts. These are
// assignment writes in the same sense Wave 2 established for the rest of the
// lifecycle: authorized against the caller's own uid, running on the Admin
// SDK, never trusted from the request body. src/lib/deliveryOffers.ts is a
// thin fetch wrapper around the two routes that call into this module.

import { getAdminDb } from "@/server/firebaseAdmin";

export type OfferActionResult = { ok: true } | { ok: false; status: 403 | 404 | 409; error: string };

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

/**
 * Accepts an outstanding offer. All reads happen before any write — Firestore
 * transactions reject a read issued after a write, and that exact mistake
 * has shipped once already in this codebase.
 */
export async function acceptDelivery(deliveryId: string, callerUid: string): Promise<OfferActionResult> {
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);
  const availabilityRef = db.collection("riderAvailability").doc(callerUid);
  const userRef = db.collection("users").doc(callerUid);

  try {
    return await db.runTransaction(async (tx): Promise<OfferActionResult> => {
      const [deliverySnap, availabilitySnap, userSnap] = await tx.getAll(deliveryRef, availabilityRef, userRef);

      if (!deliverySnap.exists) return { ok: false, status: 404, error: "Delivery not found." };
      const delivery = deliverySnap.data()!;

      if (delivery.status !== "offered") {
        return { ok: false, status: 409, error: "This delivery is no longer available." };
      }
      // Should be impossible alongside status "offered" — kept as an
      // explicit, independent check rather than assumed from the status.
      if (delivery.riderId) {
        return { ok: false, status: 409, error: "This delivery was taken by another rider." };
      }
      const expiresAt = delivery.offerExpiresAt;
      if (typeof expiresAt !== "number" || expiresAt <= Date.now()) {
        return { ok: false, status: 409, error: "This offer has expired." };
      }
      const offeredTo: string[] = Array.isArray(delivery.offeredTo) ? delivery.offeredTo : [];
      if (!offeredTo.includes(callerUid)) {
        return { ok: false, status: 403, error: "This delivery wasn't offered to you." };
      }

      if (!availabilitySnap.exists || availabilitySnap.data()?.status !== "online") {
        return {
          ok: false,
          status: 409,
          error: "You're not currently visible to dispatch — go online again to accept jobs.",
        };
      }

      const availability = availabilitySnap.data()!;
      const userData = userSnap.exists ? userSnap.data() : undefined;
      const name = typeof availability.name === "string" ? availability.name : "Rider";
      const vehicle = typeof userData?.vehicle === "string" ? userData.vehicle : undefined;

      const now = Date.now();
      tx.update(deliveryRef, {
        status: "assigned",
        riderId: callerUid,
        rider: {
          name,
          initials: initialsFor(name),
          vehicle: vehicle ?? null,
        },
        assignedAt: now,
        offeredTo: [],
        offeredAt: null,
        offerExpiresAt: null,
      });
      tx.update(availabilityRef, { status: "busy", updatedAt: now });

      return { ok: true };
    });
  } catch (err) {
    console.error(`Failed to accept delivery ${deliveryId} for rider ${callerUid}:`, err);
    throw err;
  }
}

/**
 * Rejects an outstanding offer. The rejecting rider is recorded in
 * rejectedBy (kept across offer rounds — see broadcastOffer in
 * src/server/dispatch.ts) and is never touched on availability: rejecting
 * keeps a rider fully online and available for other work. If this was the
 * last outstanding recipient, the delivery returns to "pending" so it can be
 * offered again to whoever is left.
 */
export async function rejectDelivery(deliveryId: string, callerUid: string): Promise<OfferActionResult> {
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);

  try {
    return await db.runTransaction(async (tx): Promise<OfferActionResult> => {
      const deliverySnap = await tx.get(deliveryRef);

      if (!deliverySnap.exists) return { ok: false, status: 404, error: "Delivery not found." };
      const delivery = deliverySnap.data()!;

      if (delivery.status !== "offered") {
        return { ok: false, status: 409, error: "This delivery is no longer available." };
      }
      const offeredTo: string[] = Array.isArray(delivery.offeredTo) ? delivery.offeredTo : [];
      if (!offeredTo.includes(callerUid)) {
        return { ok: false, status: 403, error: "This delivery wasn't offered to you." };
      }

      const remaining = offeredTo.filter((uid) => uid !== callerUid);
      const rejectedBy: string[] = Array.isArray(delivery.rejectedBy) ? delivery.rejectedBy : [];
      const nextRejectedBy = rejectedBy.includes(callerUid) ? rejectedBy : [...rejectedBy, callerUid];

      if (remaining.length === 0) {
        tx.update(deliveryRef, {
          status: "pending",
          offeredTo: [],
          offeredAt: null,
          offerExpiresAt: null,
          rejectedBy: nextRejectedBy,
        });
      } else {
        tx.update(deliveryRef, {
          offeredTo: remaining,
          rejectedBy: nextRejectedBy,
        });
      }

      return { ok: true };
    });
  } catch (err) {
    console.error(`Failed to reject delivery ${deliveryId} for rider ${callerUid}:`, err);
    throw err;
  }
}
