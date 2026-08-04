// Thin client wrapper around POST /api/quotes, mirroring src/lib/deliveries.ts:
// attaches the caller's ID token and shapes the response, no pricing logic
// of its own — that's src/server/fare.ts's job.

import { auth } from "@/lib/firebase";
import type { QuoteRequestInput } from "@/lib/schemas";

export type Quote = {
  quoteId: string;
  amountKobo: number;
  distanceMeters: number;
  durationSeconds: number | null;
  basis: "road" | "straight_line_fallback";
};

/** Prices a trip. Throws with the server's message on rejection (e.g. beyond MAX_TRIP_DISTANCE_KM) so the form can surface it. */
export async function fetchQuote(input: QuoteRequestInput): Promise<Quote> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error || `Quote failed (${res.status})`);
  }
  return data as Quote;
}
