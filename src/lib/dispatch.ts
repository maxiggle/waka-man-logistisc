// Thin client wrappers around the server-side matching endpoints
// (src/server/dispatch.ts, exposed via src/app/api/dispatch/*). Matching
// itself — the geohash query, the vehicle-eligibility filter, and the
// claim transaction — runs entirely server-side now (Wave 2), trusted
// because it's gated on the caller's Firebase ID token rather than
// whichever browser happens to call it. This module's only job is
// attaching that token and shaping the response.
//
// Relative /api/… URLs are correct even from the Capacitor shell: it loads
// the app from the deployed origin, so these calls are same-origin there too.

import { auth } from "@/lib/firebase";

export type MatchedRider = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicle?: string;
  distanceKm: number;
};

export type MatchedDelivery = {
  id: string;
  distanceKm: number;
};

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

/** Asks the server to find and claim the nearest eligible rider for a freshly created delivery. */
export async function matchNearestRider(deliveryId: string): Promise<MatchedRider | null> {
  const data = (await authorizedPost("/api/dispatch/match-rider", { deliveryId })) as { rider: MatchedRider | null };
  return data.rider;
}

/** Asks the server to find and claim the nearest still-pending, eligible delivery for the calling rider. */
export async function matchNearestDelivery(): Promise<MatchedDelivery | null> {
  const data = (await authorizedPost("/api/dispatch/match-delivery")) as { delivery: MatchedDelivery | null };
  return data.delivery;
}
