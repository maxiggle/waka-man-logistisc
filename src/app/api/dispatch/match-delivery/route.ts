// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest, adminDb } from "@/server/firebaseAdmin";
import { matchNearestDelivery } from "@/server/dispatch";

export async function POST(request: NextRequest) {
  const uid = await getUidFromRequest(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The token proves who the caller is, not that they're a rider — that lives
  // in users/{uid}, so read it rather than trusting the caller's claim.
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const userData = userSnap.data();
  if (!userSnap.exists || userData?.role !== "rider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Never accept coordinates from the request body — read the rider's own
  // availability document instead.
  const availabilitySnap = await adminDb.collection("riderAvailability").doc(uid).get();
  const availability = availabilitySnap.data();
  if (!availabilitySnap.exists || typeof availability?.lat !== "number" || typeof availability?.lng !== "number") {
    return NextResponse.json({ error: "No availability record found for this rider" }, { status: 409 });
  }

  const delivery = await matchNearestDelivery({
    id: uid,
    name: userData.name ?? availability.name ?? "Rider",
    lat: availability.lat,
    lng: availability.lng,
    vehicle: typeof userData.vehicle === "string" ? userData.vehicle : undefined,
  });

  return NextResponse.json({ delivery });
}
