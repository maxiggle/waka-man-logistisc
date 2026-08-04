// Persisted price quotes (WM-101 Phase 1). A quote is priced once, here, at
// POST /api/quotes time, and read back — never recomputed — by
// src/server/deliveries.ts when the customer actually books. That gap is
// deliberate: Mapbox Directions can return a slightly different route
// between two calls, and re-pricing at booking would let a customer see one
// figure and be charged another.

import { getAdminDb } from "@/server/firebaseAdmin";
import { quoteFor } from "@/server/fare";
import { quoteRequestSchema, type QuoteRequestInput } from "@/lib/schemas";

/** How long a quote stays bookable. Short enough that road conditions/prices haven't moved, long enough to fill in a package note and hit submit. */
export const QUOTE_TTL_MS = 15 * 60 * 1000;

export interface QuoteDoc {
  clientId: string;
  vehicle: QuoteRequestInput["vehicle"];
  pickup: QuoteRequestInput["pickup"];
  dropoff: QuoteRequestInput["dropoff"];
  amountKobo: number;
  distanceMeters: number;
  durationSeconds: number | null;
  basis: "road" | "straight_line_fallback";
  createdAt: number;
  expiresAt: number;
  consumedAt?: number | null;
}

export type CreateQuoteResult =
  | {
      ok: true;
      quoteId: string;
      amountKobo: number;
      distanceMeters: number;
      durationSeconds: number | null;
      basis: QuoteDoc["basis"];
    }
  | { ok: false; status: 400 | 422; error: string };

/**
 * Prices a trip and persists it as quotes/{id} with a short TTL. The TTL is
 * enforced twice: a Firestore TTL policy on `expiresAt` for eventual
 * deletion (configured in the Firebase console/gcloud, not by this code —
 * TTL deletion can lag by up to 24h), and an explicit expiry check in
 * getQuoteForBooking below, which is what actually gates whether the quote
 * can still be booked.
 */
export async function createQuote(input: unknown, callerUid: string): Promise<CreateQuoteResult> {
  const parsed = quoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid quote request.",
    };
  }
  const { pickup, dropoff, vehicle } = parsed.data;

  const quote = await quoteFor(vehicle, pickup, dropoff);
  if (!quote.ok) {
    if (quote.reason === "too_far") {
      const km = (quote.distanceMeters / 1000).toFixed(1);
      return {
        ok: false,
        status: 422,
        error: `This trip is ${km} km, which is beyond what we currently serve.`,
      };
    }
    // reason === "unpriced": config/pricing is missing or failed validation.
    // Fail loudly rather than guessing a price — see the Failure mode note
    // on WM-101 Phase 2.
    return { ok: false, status: 422, error: "Pricing isn't configured right now. Please try again shortly." };
  }

  const db = getAdminDb();
  const ref = db.collection("quotes").doc();
  const now = Date.now();
  const doc: QuoteDoc = {
    clientId: callerUid,
    vehicle,
    pickup,
    dropoff,
    amountKobo: quote.amountKobo,
    distanceMeters: quote.distanceMeters,
    durationSeconds: quote.durationSeconds,
    basis: quote.basis,
    createdAt: now,
    expiresAt: now + QUOTE_TTL_MS,
  };
  await ref.set(doc);

  return {
    ok: true,
    quoteId: ref.id,
    amountKobo: quote.amountKobo,
    distanceMeters: quote.distanceMeters,
    durationSeconds: quote.durationSeconds,
    basis: quote.basis,
  };
}

export type GetQuoteResult = { ok: true; quote: QuoteDoc } | { ok: false; status: 403 | 404 | 409; error: string };

/**
 * Reads a quote back for booking, verifying it belongs to the caller and
 * hasn't expired. Does not mark it consumed — a quote may legally be read
 * here and then have the booking request fail validation downstream: that's
 * still a legitimate re-attempt with the same quote, not a replay.
 */
export async function getQuoteForBooking(quoteId: string, callerUid: string): Promise<GetQuoteResult> {
  const db = getAdminDb();
  const snap = await db.collection("quotes").doc(quoteId).get();
  if (!snap.exists) return { ok: false, status: 404, error: "This quote no longer exists. Please get a new quote." };

  const quote = snap.data() as QuoteDoc;
  if (quote.clientId !== callerUid) {
    return { ok: false, status: 403, error: "This quote doesn't belong to you." };
  }
  if (Date.now() > quote.expiresAt) {
    return { ok: false, status: 409, error: "This quote has expired. Please get a new quote." };
  }

  return { ok: true, quote };
}
