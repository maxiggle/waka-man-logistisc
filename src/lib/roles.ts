import type { UserRole } from "@/context/AuthContext";

/**
 * Superadmin ⊃ admin (WM-103): a superadmin is a strict superset of an
 * admin — delivery/rider oversight plus pricing control — so anywhere the
 * app used to gate on `role === "admin"`, a superadmin qualifies too.
 * Mirrors firestore.rules' isAdmin(). For pricing-specific gates, check
 * `role === "superadmin"` directly instead — that stays strict on purpose.
 */
export function hasAdminAccess(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}
