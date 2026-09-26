import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { DeliveryItem, DeliveryStatus } from "@/lib/schemas";

export const STATUS_META: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: "Pending rider", cls: "bg-primary-light/20 text-primary-light" },
  offered: { label: "Offer sent", cls: "bg-primary-light/20 text-primary-light" },
  assigned: { label: "Awaiting pickup", cls: "bg-amber-400/15 text-amber-400" },
  picked_up: { label: "Picked up", cls: "bg-amber-400/15 text-amber-400" },
  in_transit: { label: "In transit", cls: "bg-accent/15 text-accent" },
  arrived: { label: "Arrived", cls: "bg-accent/15 text-accent" },
  delivered: { label: "Delivered", cls: "bg-emerald-400/15 text-emerald-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-400/15 text-red-400" },
};

export type RiderStat = {
  id: string;
  name: string;
  initials: string;
  deliveries: number;
  rating: number;
};

export function addressOf(place: DeliveryItem["pickup"] | undefined): string {
  if (!place) return "";
  return typeof place === "string" ? place : place.address || "";
}

export async function fetchRecentDeliveries(max: number): Promise<DeliveryItem[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "deliveries"), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeliveryItem);
}

export async function fetchRiderStats(): Promise<RiderStat[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "users")));
  return snap.docs
    .filter((d) => d.data().role === "rider")
    .map((d) => {
      const data = d.data();
      const name = data.name || "Rider";
      const initials = name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      return {
        id: d.id,
        name,
        initials: initials || "WM",
        deliveries: data.deliveriesCompleted || 0,
        rating: data.ratingAvg || 5.0,
      };
    });
}
