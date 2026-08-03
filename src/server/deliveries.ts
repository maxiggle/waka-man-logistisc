// Server-side delivery creation. Booking moved off the client so that the
// price is decided by the server and frozen on the document at the moment
// the customer commits to it (W5-T4).
//
// Under the old path the browser wrote the delivery itself, which meant the
// only price on the document was a display string the client had chosen.
// Three separate problems came out of that: the quote shown on the rider's
// offer card was customer-controlled, an unrecognized `vehicle` produced a
// delivery nothing could price or match, and the fare had to be recomputed
// from the price table at payment time — so a price change between booking
// and payment rejected the customer's payment as underpayment.
//
// Stamping quotedAmountKobo here fixes all three at once, and lets
// `allow create` on deliveries drop to false in firestore.rules.

import { getAdminDb } from "@/server/firebaseAdmin";
import { quoteKobo } from "@/server/fare";
import { deliveryCreateSchema } from "@/lib/schemas";

export type CreateDeliveryResult =
  | { ok: true; deliveryId: string; quotedAmountKobo: number }
  | { ok: false; status: 400 | 500; error: string };

export async function createDelivery(
  input: unknown,
  callerUid: string,
  callerName: string | null,
  callerEmail: string | null,
): Promise<CreateDeliveryResult> {
  // The request body is parsed, not cast. Anything not in the schema is
  // rejected outright rather than written through to Firestore — see the
  // .strict() note on deliveryCreateSchema.
  const parsed = deliveryCreateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid booking details.",
    };
  }
  const { pickup, dropoff, vehicle, packageNote } = parsed.data;

  // Priced once, here. Everything downstream reads this number back off the
  // document rather than recomputing it.
  const quotedAmountKobo = quoteKobo(vehicle, pickup, dropoff);

  const now = Date.now();
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc();

  await deliveryRef.set({
    clientId: callerUid,
    clientName: callerName || "Client",
    clientEmail: callerEmail || "",
    riderId: null,
    status: "pending",
    pickup,
    dropoff,
    vehicle,
    packageNote: packageNote ?? "",
    quotedAmountKobo,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, deliveryId: deliveryRef.id, quotedAmountKobo };
}
