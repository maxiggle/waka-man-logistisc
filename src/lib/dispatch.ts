// Thin client wrappers around the server-side matching endpoints
// (src/server/dispatch.ts, exposed via src/app/api/dispatch/*). Matching
// itself — the geohash query, the vehicle-eligibility filter, and the
// offer-broadcast transaction — runs entirely server-side now (Wave 2),
// trusted because it's gated on the caller's Firebase ID token rather than
// whichever browser happens to call it. This module's only job is
// attaching that token and shaping the response.
//
// W4-T1: matching offers rather than assigns — these calls return which
// riders a delivery was offered to, not a winner. Both call sites in this
// app (src/app/send/page.tsx, src/app/rider/active/page.tsx) treat the
// result as fire-and-forget; the actual assignment happens only when a
// rider accepts via src/lib/deliveryOffers.ts.
//
// Relative /api/… URLs are correct even from the Capacitor shell: it loads
// the app from the deployed origin, so these calls are same-origin there too.

import { auth } from "@/lib/firebase";

export type OfferResult = { deliveryId: string; offeredTo: string[] };

async function authorizedPost(path: string, body?: unknown): Promise<unknown> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || `Request to ${path} failed (${res.status})`);
  }
  return data;
}

/** Asks the server to offer a freshly created delivery to every eligible nearby rider. */
export async function matchNearestRider(deliveryId: string): Promise<OfferResult | null> {
  const data = (await authorizedPost("/api/dispatch/match-rider", { deliveryId })) as { offer: OfferResult | null };
  return data.offer;
}

/** Asks the server to find and offer the nearest still-pending, eligible delivery to nearby riders, including the caller. */
export async function matchNearestDelivery(): Promise<OfferResult | null> {
  const data = (await authorizedPost("/api/dispatch/match-delivery")) as { offer: OfferResult | null };
  return data.offer;
}
