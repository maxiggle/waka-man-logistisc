// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest, getAdminDb } from "@/server/firebaseAdmin";
import { matchNearestDelivery } from "@/server/dispatch";
import { isApprovedRider } from "@/server/riderAccess";
import {
  AVAILABILITY_MATCH_FRESHNESS_MS,
  MATCH_DELIVERY_RATE_LIMIT,
  MATCH_DELIVERY_RATE_WINDOW_MS,
} from "@/lib/dispatchConfig";

// Best-effort, per-instance rate limiting: this Map lives in the function
// instance's own memory, not a shared store, so it resets on cold start and
// doesn't coordinate across concurrently-warm instances — a rider spread
// across several instances could exceed the nominal limit. There's no
// durable KV (Redis/Upstash, etc.) wired into this project yet, so this is
// a cheap deterrent against a single client hammering an expensive scan,
// not a hard guarantee. Revisit with a durable store if cross-instance
// abuse turns out to matter in practice.
const rateLimitState = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(uid: string): boolean {
  const now = Date.now();
  const entry = rateLimitState.get(uid);
  if (!entry || now - entry.windowStart > MATCH_DELIVERY_RATE_WINDOW_MS) {
    rateLimitState.set(uid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MATCH_DELIVERY_RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (isRateLimited(uid)) {
      return NextResponse.json({ error: "Too many requests — slow down and try again shortly." }, { status: 429 });
    }

    const db = getAdminDb();

    // The token proves who the caller is, not that they're a rider — that lives
    // in users/{uid}, so read it rather than trusting the caller's claim.
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data();
    if (!userSnap.exists || userData?.role !== "rider") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const approved = await isApprovedRider(uid);
    if (!approved) {
      return NextResponse.json({ error: "Your rider account is awaiting approval." }, { status: 403 });
    }

    // Never accept coordinates from the request body — read the rider's own
    // availability document instead.
    const availabilitySnap = await db.collection("riderAvailability").doc(uid).get();
    const availability = availabilitySnap.data();
    if (!availabilitySnap.exists || typeof availability?.lat !== "number" || typeof availability?.lng !== "number") {
      return NextResponse.json({ error: "No availability record found for this rider" }, { status: 409 });
    }

    // Pin the stale-availability decision (previously undecided/E14): the
    // claim transaction would eventually reject a non-online rider anyway,
    // but only after a full pending-collection scan — check status and TTL
    // here instead, and short-circuit before that scan runs at all.
    const isStale =
      typeof availability.updatedAt !== "number" || Date.now() - availability.updatedAt > AVAILABILITY_MATCH_FRESHNESS_MS;
    if (availability.status !== "online" || isStale) {
      return NextResponse.json(
        { error: "You're not currently visible to dispatch — go online again to search for a delivery." },
        { status: 409 },
      );
    }

    const offer = await matchNearestDelivery({
      id: uid,
      name: userData.name ?? availability.name ?? "Rider",
      lat: availability.lat,
      lng: availability.lng,
      vehicle: typeof userData.vehicle === "string" ? userData.vehicle : undefined,
    });

    return NextResponse.json({ offer });
  } catch (err) {
    // Covers a missing FIREBASE_SERVICE_ACCOUNT_B64 (getAdminDb/getUidFromRequest
    // throw rather than fail silently) and any other unexpected failure — the
    // response body must never echo the error, which could include env var
    // names or credential material.
    console.error("POST /api/dispatch/match-delivery failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
