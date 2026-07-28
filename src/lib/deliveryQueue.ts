// Read-side helper for unmatched deliveries, used when a rider comes online
// and we check whether there's a waiting job nearby (see matchNearestDelivery
// in src/lib/dispatch.ts). Pending volume is expected to stay small, so this
// is a plain collection scan rather than anything geo-indexed.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type PendingDelivery = {
  id: string;
  pickup: { lat: number; lng: number } | null;
};

export async function getPendingDeliveries(): Promise<PendingDelivery[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "deliveries"), where("status", "==", "pending")));
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    const pickup =
      data.pickup && typeof data.pickup.lat === "number" && typeof data.pickup.lng === "number"
        ? { lat: data.pickup.lat, lng: data.pickup.lng }
        : null;
    return { id: docSnap.id, pickup };
  });
}
