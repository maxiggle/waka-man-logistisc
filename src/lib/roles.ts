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

/**
 * Where "home" is for a given role — used by post-login routing and by the
 * back links on pages a signed-in user can land on directly.
 *
 * Shared rather than repeated: the copy in src/app/page.tsx tested
 * `role === "admin"` and so sent a superadmin to /dashboard, relying on the
 * dashboard's own redirect to bounce them onward. Going through
 * hasAdminAccess() here means adding a role can't leave one router behind.
 */
export function homeRouteForRole(role: UserRole | undefined | null): string {
  if (hasAdminAccess(role)) return "/admin";
  if (role === "rider") return "/rider/active";
  return "/dashboard";
}
