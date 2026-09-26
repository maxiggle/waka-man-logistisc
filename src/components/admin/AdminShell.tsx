"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { hasAdminAccess } from "@/lib/roles";

// Icon paths (Heroicons outline, 24x24 viewBox) kept out of JSX loops so they
// don't get re-created on every render.
export const ICONS = {
  truck: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25h5.084c.532 0 1.023.28 1.294.736l1.599 2.67M14.25 7.5v11.25m0-11.25H8.625",
  riders: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  package: "M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9m-8.25-9v9l8.25 4.5",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  admins: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  exit: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H8.25m9.75 0-3-3m3 3-3 3",
  grid: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  refresh: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
};

export function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const LINK_BASE =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer";

type Props = {
  children: ReactNode;
  /** When provided, the top-bar search box is shown and controlled by the page. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

/**
 * Shared chrome (access gate, sidebar, top bar, pending-requests banner) for
 * the admin dashboard, deliveries and fleet screens. Children mount only once
 * the caller is confirmed to be an admin, so pages can fetch data on mount.
 */
export default function AdminShell({ children, search, onSearchChange, searchPlaceholder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  // Re-check invite/admin status on every visit (not just at sign-in) so
  // an invite added while already signed in takes effect without a full
  // reload — see refreshUserProfile in AuthContext.tsx.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${pathname}`);
      return;
    }

    let cancelled = false;
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      const admin = hasAdminAccess(profile?.role);
      setIsAdmin(admin);
      setCheckingAdmin(false);
      if (!admin) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router, refreshUserProfile, pathname]);

  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;
    if (!isFirebaseConfigured || !db) return;
    getDocs(query(collection(db, "riderAccessRequests"), where("status", "==", "pending")))
      .then((snap) => setPendingRequests(snap.docs.length))
      .catch((err) => console.error("Failed to count pending rider requests:", err));
  }, [authLoading, checkingAdmin, user, isAdmin]);

  if (authLoading || checkingAdmin || !user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

  const adminName = userProfile?.name || user.displayName || "Admin";
  const adminInitials = adminName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems: { href: string; label: string; icon: string; badge?: number; hidden?: boolean }[] = [
    { href: "/admin", label: "Dashboard", icon: ICONS.grid },
    { href: "/admin/deliveries", label: "Deliveries", icon: ICONS.package },
    { href: "/admin/fleet", label: "Riders", icon: ICONS.riders },
    { href: "/admin/riders", label: "Rider requests", icon: ICONS.riders, badge: pendingRequests },
    { href: "/admin/team", label: "Manage admins", icon: ICONS.admins },
    { href: "/admin/areas", label: "Service areas", icon: ICONS.pin },
    // Strictly role === "superadmin", not hasAdminAccess() — a plain admin
    // reaches these pages too (WM-103: superadmin ⊃ admin), but pricing
    // control is the one thing that stays a superadmin-only grant.
    { href: "/admin/pricing", label: "Pricing", icon: ICONS.grid, hidden: userProfile?.role !== "superadmin" },
  ];
  const visibleNav = navItems.filter((n) => !n.hidden);

  return (
    <main className="min-h-screen bg-[#141019] text-white lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-white/10 px-4 py-6">
        <Link href="/" className="flex items-center gap-2.5 px-2 font-display font-extrabold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-white.png" alt="" className="h-8 w-auto" />
          <span>
            waka man
            <span className="block text-[9px] font-bold tracking-[0.3em] uppercase text-accent">Dispatch Admin</span>
          </span>
        </Link>

        <p className="mt-8 px-3 text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">Menu</p>
        <nav className="mt-1 flex flex-col gap-1">
          {visibleNav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`${LINK_BASE} ${active ? "bg-primary/20 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                <Icon path={n.icon} className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                {n.label}
                {!!n.badge && (
                  <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-[#141019]">
                    {n.badge}
                  </span>
                )}
              </Link>
            );
          })}
          <Link href="/" className={`${LINK_BASE} text-white/60 hover:text-white hover:bg-white/5`}>
            <Icon path={ICONS.exit} className="h-4 w-4" />
            Exit
          </Link>
        </nav>

        <div className="mt-auto rounded-2xl bg-gradient-to-br from-primary to-primary-soft p-4">
          <p className="text-sm font-bold">Grow the fleet</p>
          <p className="mt-1 text-xs text-white/70">Invite riders to register and expand coverage.</p>
          <Link
            href="/register?as=rider"
            className="mt-3 inline-block rounded-lg bg-white text-primary text-xs font-bold px-3 py-2 hover:bg-white/90 transition-colors cursor-pointer"
          >
            Rider sign-up link
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-[1400px] px-6 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mark-white.png" alt="" className="h-8 w-auto" />
            </Link>

            {onSearchChange ? (
              <label className="hidden sm:flex flex-1 max-w-sm items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2">
                <Icon path={ICONS.search} className="h-4 w-4 text-white/35 shrink-0" />
                <input
                  type="text"
                  value={search ?? ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder ?? "Search..."}
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
              </label>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              {userProfile?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userProfile.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-light to-accent flex items-center justify-center text-[11px] font-extrabold">
                  {adminInitials}
                </span>
              )}
              <div className="hidden sm:block">
                <p className="text-xs font-bold leading-tight">{adminName}</p>
                <p className="text-[11px] text-white/40 leading-tight">{userProfile?.email || user.email}</p>
              </div>
            </div>
          </div>

          {/* Mobile-only nav row */}
          <div className="flex lg:hidden items-center gap-5 overflow-x-auto px-6 pb-3 text-xs whitespace-nowrap">
            {visibleNav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`font-semibold transition-colors cursor-pointer ${pathname === n.href ? "text-accent" : "text-white/60 hover:text-white"}`}
              >
                {n.label}
                {!!n.badge && ` (${n.badge})`}
              </Link>
            ))}
            <Link href="/" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">
              Exit
            </Link>
          </div>
        </header>

        {pendingRequests > 0 && (
          <div className="bg-primary-light/20 text-primary-light px-6 py-3 text-sm font-semibold flex flex-wrap items-center justify-center gap-2 text-center">
            <span>
              {pendingRequests} pending rider access request{pendingRequests === 1 ? "" : "s"}.
            </span>
            <Link href="/admin/riders" className="underline hover:text-white transition-colors">
              Review requests
            </Link>
          </div>
        )}

        <div className="mx-auto max-w-[1400px] px-6 py-8">
          {!isFirebaseConfigured ? (
            <div className="rounded-2xl border border-amber-200/20 bg-amber-500/10 p-6 text-amber-300">
              <h2 className="font-bold text-lg">Firebase Unconfigured</h2>
              <p className="mt-1 text-sm text-amber-300/80">
                Connect your Firebase Firestore credentials in <code className="font-mono text-xs bg-black/40 px-1 py-0.5 rounded">.env.local</code> to access live fleet management.
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </main>
  );
}
