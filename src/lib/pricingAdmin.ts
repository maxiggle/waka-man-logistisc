// Thin client wrapper around /api/admin/pricing[/history] — attaches the
// caller's ID token and shapes the response, no pricing logic of its own.
// Superadmin authorization happens server-side (src/server/roles.ts); a
// non-superadmin gets a 403 here, not a client-side-only gate.

import { auth } from "@/lib/firebase";
import type { PricingConfigInput, PricingHistoryEntry } from "@/lib/schemas";

async function authorizedFetch(path: string, init?: RequestInit): Promise<unknown> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
  }
  return data;
}

export type PricingConfigResponse = { current: PricingConfigInput | null; seed: PricingConfigInput; updatedAt: number | null };

export async function fetchPricingConfig(): Promise<PricingConfigResponse> {
  return (await authorizedFetch("/api/admin/pricing")) as PricingConfigResponse;
}

export async function savePricingConfig(input: PricingConfigInput): Promise<PricingConfigResponse> {
  return (await authorizedFetch("/api/admin/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })) as PricingConfigResponse;
}

export async function fetchPricingHistory(): Promise<(PricingHistoryEntry & { id: string })[]> {
  const data = (await authorizedFetch("/api/admin/pricing/history")) as { entries: (PricingHistoryEntry & { id: string })[] };
  return data.entries;
}

/** Reachable by any admin, not just a superadmin — see the route's own comment for why. */
export async function fetchPricingStatus(): Promise<{ healthy: boolean }> {
  return (await authorizedFetch("/api/admin/pricing/status")) as { healthy: boolean };
}
