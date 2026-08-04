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
// WM-101 Phase 1 moves pricing itself one step earlier: booking no longer
// prices the trip at all, it reads back a quotes/{id} doc created by
// POST /api/quotes (src/server/quotes.ts) moments earlier. See that file's
// header for why re-pricing here would be wrong even though it's tempting —
// Directions can return a slightly different route on a second call.
//
// Stamping quotedAmountKobo here fixes all three original problems at once,
// and lets `allow create` on deliveries drop to false in firestore.rules.

import { getAdminDb } from "@/server/firebaseAdmin";
import { getQuoteForBooking } from "@/server/quotes";
import { deliveryCreateSchema } from "@/lib/schemas";

export type CreateDeliveryResult =
  | { ok: true; deliveryId: string; quotedAmountKobo: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

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
  const { quoteId, packageNote } = parsed.data;

  const quoteResult = await getQuoteForBooking(quoteId, callerUid);
  if (!quoteResult.ok) return { ok: false, status: quoteResult.status, error: quoteResult.error };
  const quote = quoteResult.quote;

  const now = Date.now();
  const db = getAdminDb();
  const deliveryRef = db.collection("deliveries").doc();

  await deliveryRef.set({
    clientId: callerUid,
    clientName: callerName || "Client",
    clientEmail: callerEmail || "",
    riderId: null,
    status: "pending",
    pickup: quote.pickup,
    dropoff: quote.dropoff,
    vehicle: quote.vehicle,
    packageNote: packageNote ?? "",
    quotedAmountKobo: quote.amountKobo,
    distanceMeters: quote.distanceMeters,
    durationSeconds: quote.durationSeconds,
    pricingBasis: quote.basis,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, deliveryId: deliveryRef.id, quotedAmountKobo: quote.amountKobo };
}
