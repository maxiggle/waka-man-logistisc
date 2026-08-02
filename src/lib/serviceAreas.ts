// Admin-managed service areas (serviceAreas/{id}) — the search bias for
// address autocomplete and the map's fallback centre. Never a hard
// restriction on where a delivery can be booked; see the doc comment on
// serviceAreaSchema in src/lib/schemas.ts.
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { serviceAreaSchema } from "@/lib/schemas";
import { FALLBACK_SERVICE_AREA } from "@/lib/dispatchConfig";

export type ServiceArea = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  active: boolean;
};

const COLLECTION = "serviceAreas";

/** Reads every service area. Malformed docs are skipped, not thrown on. */
export async function listServiceAreas(): Promise<ServiceArea[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const areas: ServiceArea[] = [];
    snap.forEach((docSnap) => {
      const parsed = serviceAreaSchema.safeParse(docSnap.data());
      if (parsed.success) areas.push({ id: docSnap.id, ...parsed.data });
    });
    return areas;
  } catch (err) {
    console.error("Failed to list service areas:", err);
    return [];
  }
}

/**
 * The active default service area — the active area with isDefault: true; if
 * none, the first active one; if none at all or the read fails,
 * FALLBACK_SERVICE_AREA. Never rejects.
 */
export async function getDefaultServiceArea(): Promise<{ lat: number; lng: number; name: string }> {
  try {
    const active = (await listServiceAreas()).filter((a) => a.active);
    const area = active.find((a) => a.isDefault) ?? active[0];
    if (area) return { lat: area.lat, lng: area.lng, name: area.name };
  } catch (err) {
    console.error("Failed to resolve default service area:", err);
  }
  return FALLBACK_SERVICE_AREA;
}

/** Adds a new service area. Starts active, never default (set that explicitly). */
export async function addServiceArea(input: { name: string; lat: number; lng: number }): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, {
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    isDefault: false,
    active: true,
    createdAt: Date.now(),
  });
}

/**
 * Removes a service area. Refused for the last active one — everything falls
 * back to FALLBACK_SERVICE_AREA if the collection empties, but an admin
 * emptying it by accident should be told, not silently rescued.
 */
export async function deleteServiceArea(id: string): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  const areas = await listServiceAreas();
  const target = areas.find((a) => a.id === id);
  const activeCount = areas.filter((a) => a.active).length;
  if (target?.active && activeCount <= 1) {
    throw new Error("Can't remove the last active service area — add another one first.");
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Activates/deactivates a service area. Deactivating the last active one is refused. */
export async function setServiceAreaActive(id: string, active: boolean): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  if (!active) {
    const areas = await listServiceAreas();
    const target = areas.find((a) => a.id === id);
    const activeCount = areas.filter((a) => a.active).length;
    if (target?.active && activeCount <= 1) {
      throw new Error("Can't deactivate the last active service area — add another one first.");
    }
  }
  await updateDoc(doc(db, COLLECTION, id), { active });
}

/**
 * Sets `id` as the default area, clearing isDefault on every other area in a
 * single batch — there is never a moment with two defaults.
 */
export async function setDefaultServiceArea(id: string): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  const database = db;
  const areas = await listServiceAreas();
  const batch = writeBatch(database);
  for (const area of areas) {
    if (area.id === id && !area.isDefault) batch.update(doc(database, COLLECTION, area.id), { isDefault: true });
    else if (area.id !== id && area.isDefault) batch.update(doc(database, COLLECTION, area.id), { isDefault: false });
  }
  await batch.commit();
}

// Only read a position the customer has ALREADY granted — asking on the
// booking form, before they have typed anything or seen any benefit, is the
// worst possible moment and most people decline. If permission isn't already
// granted, the default service area is a perfectly good bias.
export async function currentPositionIfPermitted(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) return null;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (status.state !== "granted") return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 3000, maximumAge: 300_000 },
      );
    });
  } catch {
    return null;
  }
}
