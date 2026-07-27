// Requires the Admin SDK's Node built-ins — will not run on Edge.
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { getUidFromRequest, adminDb } from "@/server/firebaseAdmin";
import { matchNearestRider } from "@/server/dispatch";
import type { ServiceLevel } from "@/lib/dispatchConfig";

export async function POST(request: NextRequest) {
  const uid = await getUidFromRequest(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const deliveryId = typeof body?.deliveryId === "string" ? body.deliveryId : null;
  if (!deliveryId) return NextResponse.json({ error: "deliveryId is required" }, { status: 400 });

  const deliveryRef = adminDb.collection("deliveries").doc(deliveryId);
  const deliverySnap = await deliveryRef.get();
  if (!deliverySnap.exists) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });

  const delivery = deliverySnap.data()!;
  if (delivery.clientId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (delivery.riderId || delivery.status !== "pending") {
    return NextResponse.json({ error: "Delivery is no longer unassigned" }, { status: 409 });
  }

  // Read pickup coordinates from the stored document, never from the request body.
  const pickup = delivery.pickup;
  if (!pickup || typeof pickup.lat !== "number" || typeof pickup.lng !== "number") {
    return NextResponse.json({ error: "Delivery has no resolved pickup coordinates" }, { status: 422 });
  }

  const serviceLevel = (typeof delivery.vehicle === "string" ? delivery.vehicle : "standard") as ServiceLevel;
  const rider = await matchNearestRider(deliveryId, [pickup.lat, pickup.lng], serviceLevel);

  return NextResponse.json({ rider });
}
