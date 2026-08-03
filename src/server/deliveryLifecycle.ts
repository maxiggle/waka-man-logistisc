// Server-side delivery lifecycle writes: status advances, rider-initiated
// release, and delivered completion (code-gated). These are assignment
// writes in the same sense Wave 2 established for matching/claiming — they
// must be authorized against the caller's own uid and validated against the
// shared transition map, not trusted from a browser. src/lib/deliveryLifecycle.ts
// is a thin fetch wrapper around the two routes that call into this module.

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/server/firebaseAdmin";
import { DELIVERY_STATUS_TRANSITIONS, type DeliveryStatus } from "@/lib/schemas";

export type NonTerminalStatus = "picked_up" | "in_transit" | "arrived";

// Only actual rule violations belong here — a 404/403/409/400 the caller
// can act on. An unexpected exception (missing service account, Firestore
// unreachable, a genuine bug) must propagate instead of being disguised as
// one of these; the route's own catch turns that into a 500. Conflating the
// two is exactly how a real transaction-ordering crash here once surfaced
// as an indistinguishable "you can't do that" 409.
export type LifecycleResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/**
 * picked_up → in_transit → arrived, or a pre-pickup release back to
 * "pending" (rider-initiated; distinct from "cancelled", reserved for
 * client/admin). Authorization and the transition-legality check both run
 * inside the transaction, mirroring tryClaimDelivery's re-assert-inside-
 * the-transaction discipline in src/server/dispatch.ts.
 */
export async function advanceDeliveryStatus(
  deliveryId: string,
  callerUid: string,
  targetStatus: NonTerminalStatus | "pending",
): Promise<LifecycleResult> {
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);
  const availabilityRef = db.collection("riderAvailability").doc(callerUid);

  try {
    return await db.runTransaction(async (tx): Promise<LifecycleResult> => {
      // Every read must happen before any write in a Firestore transaction —
      // both refs are read here up front, even though the availability write
      // is conditional, rather than reading it later next to its own write.
      const [deliverySnap, availabilitySnap] = await tx.getAll(deliveryRef, availabilityRef);

      if (!deliverySnap.exists) return { ok: false, status: 404, error: "Delivery not found." };
      const delivery = deliverySnap.data()!;
      if (delivery.riderId !== callerUid) {
        return { ok: false, status: 403, error: "This delivery isn't assigned to you." };
      }

      const currentStatus = delivery.status as DeliveryStatus;
      const legalTargets = DELIVERY_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (!legalTargets.includes(targetStatus)) {
        return { ok: false, status: 409, error: `Can't move from ${currentStatus} to ${targetStatus}.` };
      }

      if (targetStatus === "pending") {
        // Full unwind: the rider hasn't physically taken the package yet
        // (only legal from "assigned" per the transition map), so it's safe
        // to fully release the assignment back to the pool. releasedBy is
        // read by matchNearestDelivery to stop the releasing rider's very
        // next sweep from immediately reclaiming the job they just dropped.
        tx.update(deliveryRef, {
          status: "pending",
          riderId: null,
          rider: null,
          assignedAt: null,
          releasedBy: callerUid,
          releasedAt: Date.now(),
          updatedAt: Date.now(),
        });
        // Never resurrect a cleared availability doc with a partial write —
        // if it's absent, the rider already went properly offline and
        // there's nothing to fix here; they'll get a complete doc next time
        // they publish through the normal online flow.
        if (availabilitySnap.exists) {
          tx.update(availabilityRef, { status: "online", updatedAt: Date.now() });
        }
      } else {
        tx.update(deliveryRef, { status: targetStatus, updatedAt: Date.now() });
      }

      return { ok: true };
    });
  } catch (err) {
    console.error(`Failed to advance delivery ${deliveryId} to ${targetStatus}:`, err);
    throw err;
  }
}

/**
 * Completes a delivery as "delivered", gated on the recipient's 4-digit
 * code — compared server-side only, against a value stored outside the
 * document the assigned rider's own query ever reads
 * (deliveries/{id}/private/code), so it's never in the rider's memory
 * before they're told it by the recipient. One transaction: delivery
 * status, resetting availability to online (skipped if the doc is absent,
 * same reasoning as advanceDeliveryStatus), and incrementing
 * deliveriesCompleted all succeed or fail together.
 */
export async function completeDelivery(
  deliveryId: string,
  callerUid: string,
  enteredCode: string | undefined,
): Promise<LifecycleResult> {
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc(deliveryId);
  const codeRef = deliveryRef.collection("private").doc("code");
  const riderRef = db.collection("users").doc(callerUid);
  const availabilityRef = db.collection("riderAvailability").doc(callerUid);

  try {
    return await db.runTransaction(async (tx): Promise<LifecycleResult> => {
      const [deliverySnap, codeSnap, availabilitySnap] = await tx.getAll(deliveryRef, codeRef, availabilityRef);

      if (!deliverySnap.exists) return { ok: false, status: 404, error: "Delivery not found." };
      const delivery = deliverySnap.data()!;
      if (delivery.riderId !== callerUid) {
        return { ok: false, status: 403, error: "This delivery isn't assigned to you." };
      }

      const currentStatus = delivery.status as DeliveryStatus;
      const legalTargets = DELIVERY_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (!legalTargets.includes("delivered")) {
        return { ok: false, status: 409, error: `Can't complete a delivery in status ${currentStatus}.` };
      }

      const storedCode = codeSnap.exists ? (codeSnap.data()?.code as string | undefined) : undefined;
      if (!storedCode) {
        // Distinct from a wrong guess. Since W5-T2, this doc is created only
        // by applySuccessfulPayment (src/server/payments.ts) once a payment
        // clears — its absence means the client hasn't paid yet, not that
        // the booking broke.
        return { ok: false, status: 409, error: "This delivery hasn't been paid for yet." };
      }
      if (!enteredCode || enteredCode !== storedCode) {
        return { ok: false, status: 400, error: "That code doesn't match. Ask the recipient to confirm it." };
      }

      tx.update(deliveryRef, { status: "delivered", deliveredAt: Date.now() });
      if (availabilitySnap.exists) {
        tx.update(availabilityRef, { status: "online", updatedAt: Date.now() });
      }
      // set+merge, not update: a missing users/{uid} profile must not fail
      // the whole completion — the rider has physically finished the job.
      tx.set(riderRef, { deliveriesCompleted: FieldValue.increment(1) }, { merge: true });

      return { ok: true };
    });
  } catch (err) {
    console.error(`Failed to complete delivery ${deliveryId}:`, err);
    throw err;
  }
}
