// Thin client wrapper around the booking endpoint (src/app/api/deliveries),
// mirroring src/lib/dispatch.ts: it attaches the caller's Firebase ID token
// and shapes the response, and contains no booking logic of its own. The
// delivery document is written by src/server/deliveries.ts on the Admin SDK
// — the browser can no longer create one directly (firestore.rules denies
// it), because the fare has to be decided and frozen by the server.

import { auth } from "@/lib/firebase";
import type { DeliveryCreateInput } from "@/lib/schemas";

export type BookedDelivery = { deliveryId: string; quotedAmountKobo: number };

/**
 * Books a delivery and returns its id and the fare it was quoted at.
 * Throws with the server's message on rejection so the form can surface it
 * — a booking that failed validation server-side is a message the customer
 * needs to see, not a console log.
 */
export async function createDelivery(input: DeliveryCreateInput): Promise<BookedDelivery> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || `Booking failed (${res.status})`);
  }
  return data as BookedDelivery;
}
