// Thin client wrappers around the server-side delivery lifecycle endpoints
// (src/server/deliveryLifecycle.ts, exposed via /api/deliveries/[id]/*).
// Status advances, rider-initiated release, and delivered completion are
// assignment writes in the same sense Wave 2 established for matching and
// claiming — trusted only from the server, authorized against the caller's
// own ID token. This module only attaches that token and shapes the
// response; src/lib/dispatch.ts follows the identical pattern.

import { auth } from "@/lib/firebase";
import { clearPosition } from "@/lib/tracking";

export type NonTerminalStatus = "picked_up" | "in_transit" | "arrived";

export type LifecycleCallResult = { ok: true } | { ok: false; error: string };

async function authorizedPost(path: string, body?: unknown): Promise<LifecycleCallResult> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) return { ok: false, error: "Not signed in." };

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: (data as { error?: string } | null)?.error || `Request failed (${res.status})` };
  }
  return { ok: true };
}

/** Advances picked_up → in_transit → arrived, or releases an unpicked-up delivery back to "pending". */
export async function advanceDeliveryStatus(
  deliveryId: string,
  status: NonTerminalStatus | "pending",
): Promise<LifecycleCallResult> {
  return authorizedPost(`/api/deliveries/${deliveryId}/status`, { status });
}

/** Completes a delivery, gated on the recipient's 4-digit code. Clears the live position on success. */
export async function completeDelivery(deliveryId: string, code: string): Promise<LifecycleCallResult> {
  const result = await authorizedPost(`/api/deliveries/${deliveryId}/complete`, { code });
  if (result.ok) clearPosition(deliveryId);
  return result;
}

/**
 * Cancels a delivery the signed-in client booked. Only legal before a rider
 * accepts (CANCELLABLE_DELIVERY_STATUSES) — the server enforces that, and
 * returns a message worth showing the customer when it refuses.
 */
export async function cancelDelivery(deliveryId: string): Promise<LifecycleCallResult> {
  return authorizedPost(`/api/deliveries/${deliveryId}/cancel`);
}
