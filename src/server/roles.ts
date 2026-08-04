// Server-side role checks. Role isn't a token claim — it lives on
// users/{uid}.role in Firestore (see src/context/AuthContext.tsx) — so
// authorizing an admin/superadmin-only route means a caller's uid (already
// verified via getUidFromRequest) has to be looked up here, on the Admin
// SDK, rather than trusted from anything the request carries.

import { getAdminDb } from "@/server/firebaseAdmin";

async function getRole(uid: string): Promise<string | null> {
  const db = getAdminDb();
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? ((snap.data()?.role as string | undefined) ?? null) : null;
}

/**
 * Strict, pricing-only check — mirrors firestore.rules' isSuperAdmin().
 * Use for anything that must stay off-limits to a plain admin (pricing
 * reads/writes); use isAdminOrSuperAdmin() for everything else that used
 * to mean "admin" (WM-103: superadmin ⊃ admin).
 */
export async function isSuperAdmin(uid: string): Promise<boolean> {
  return (await getRole(uid)) === "superadmin";
}

/** Mirrors firestore.rules' isAdmin() — true for role "admin" or "superadmin". */
export async function isAdminOrSuperAdmin(uid: string): Promise<boolean> {
  const role = await getRole(uid);
  return role === "admin" || role === "superadmin";
}
