// Thin client wrappers around the server-side offer accept/reject endpoints
// (src/server/deliveryOffers.ts, exposed via /api/deliveries/[id]/*). Same
// pattern as src/lib/deliveryLifecycle.ts and src/lib/dispatch.ts: attach the
// caller's Firebase ID token and shape the response, no logic here.

import { auth } from "@/lib/firebase";

export type OfferCallResult = { ok: true } | { ok: false; error: string };

async function authorizedPost(path: string): Promise<OfferCallResult> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) return { ok: false, error: "Not signed in." };

  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: (data as { error?: string } | null)?.error || `Request failed (${res.status})` };
  }
  return { ok: true };
}

/** Accepts an outstanding delivery offer. Fails with a plain message if someone else won it first. */
export async function acceptDeliveryOffer(deliveryId: string): Promise<OfferCallResult> {
  return authorizedPost(`/api/deliveries/${deliveryId}/accept`);
}

/** Rejects an outstanding delivery offer. The rejecting rider stays online and available. */
export async function rejectDeliveryOffer(deliveryId: string): Promise<OfferCallResult> {
  return authorizedPost(`/api/deliveries/${deliveryId}/reject`);
}
