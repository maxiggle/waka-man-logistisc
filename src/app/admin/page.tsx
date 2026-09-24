"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { DeliveryItem, DeliveryStatus } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";
import { hasAdminAccess } from "@/lib/roles";
import { fetchPricingStatus } from "@/lib/pricingAdmin";

const STATUS_META: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: "Pending rider", cls: "bg-primary-light/20 text-primary-light" },
  offered: { label: "Offer sent", cls: "bg-primary-light/20 text-primary-light" },
  assigned: { label: "Awaiting pickup", cls: "bg-amber-400/15 text-amber-400" },
  picked_up: { label: "Picked up", cls: "bg-amber-400/15 text-amber-400" },
  in_transit: { label: "In transit", cls: "bg-accent/15 text-accent" },
  arrived: { label: "Arrived", cls: "bg-accent/15 text-accent" },
  delivered: { label: "Delivered", cls: "bg-emerald-400/15 text-emerald-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-400/15 text-red-400" },
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type RiderStat = {
  id: string;
  name: string;
  initials: string;
  deliveries: number;
  rating: number;
};

// Icon paths (Heroicons outline, 24x24 viewBox) kept out of JSX loops so they
// don't get re-created on every render.
const ICONS = {
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

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [riders, setRiders] = useState<RiderStat[]>([]);
  const [pendingRequests, setPendingRequests] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // null = not checked yet (or the check itself failed) — deliberately not
  // treated as unhealthy, so a transient network blip doesn't flash a false
  // "booking is down" banner. Only an explicit `false` from the API means that.
  const [pricingHealthy, setPricingHealthy] = useState<boolean | null>(null);

  // Re-check invite/admin status on every visit (not just at sign-in) so
  // an invite added while already signed in takes effect without a full
  // reload — see refreshUserProfile in AuthContext.tsx.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/admin");
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
  }, [authLoading, user, router, refreshUserProfile]);

  const fetchAdminData = useCallback(async () => {
    if (!isFirebaseConfigured || !db) {
      setLoading(false);
      return;
    }
    try {
      const deliveriesQuery = query(collection(db, "deliveries"), orderBy("createdAt", "desc"), limit(20));
      const delSnap = await getDocs(deliveriesQuery);
      const delList: DeliveryItem[] = delSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as DeliveryItem));
      setDeliveries(delList);

      const ridersQuery = query(collection(db, "users"));
      const riderSnap = await getDocs(ridersQuery);
      const riderList: RiderStat[] = riderSnap.docs
        .filter((d) => d.data().role === "rider")
        .map((doc) => {
          const data = doc.data();
          const name = data.name || "Rider";
          const initials = name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
          return {
            id: doc.id,
            name,
            initials: initials || "WM",
            deliveries: data.deliveriesCompleted || 0,
            rating: data.ratingAvg || 5.0,
          };
        });
      setRiders(riderList);

      const requestsQuery = query(collection(db, "riderAccessRequests"), where("status", "==", "pending"));
      const reqSnap = await getDocs(requestsQuery);
      setPendingRequests(reqSnap.docs.length);
    } catch (err) {
      console.error("Admin data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Admin data fetching safely updates state
    fetchAdminData().catch(console.error);
  }, [authLoading, checkingAdmin, user, isAdmin, fetchAdminData]);

  // WM-104: config/pricing missing/invalid means every booking 422s with no
  // other visible symptom — this is what makes that an unmissable banner
  // instead of something an operator only discovers from a customer complaint.
  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;
    fetchPricingStatus()
      .then((status) => setPricingHealthy(status.healthy))
      .catch((err) => console.error("Failed to check pricing config health:", err));
  }, [authLoading, checkingAdmin, user, isAdmin]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAdminData();
    setRefreshing(false);
  }

  const activeDeliveries = deliveries.filter((d) => d.status !== "delivered" && d.status !== "cancelled");
  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;
  const cancelledCount = deliveries.filter((d) => d.status === "cancelled").length;

  // Rolling count of this week's orders by weekday, from the loaded sample
  // (most recent 20) — an honest "recent activity" view, not a claim of
  // exact totals.
  const weekBuckets = useMemo(() => {
    const counts = new Array(7).fill(0);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    deliveries.forEach((d) => {
      if (!d.createdAt) return;
      const created = new Date(d.createdAt);
      if (created >= startOfWeek) counts[created.getDay()]++;
    });
    const max = Math.max(1, ...counts);
    return DAY_LABELS.map((label, i) => ({
      key: i,
      label,
      count: counts[i],
      pct: (counts[i] / max) * 100,
      isToday: i === now.getDay(),
    }));
  }, [deliveries]);
  const hasWeekActivity = weekBuckets.some((b) => b.count > 0);

  const completionPct = deliveries.length ? Math.round((deliveredCount / deliveries.length) * 100) : 0;
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;

  const filteredDeliveries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deliveries;
    return deliveries.filter((d) => {
      const pickup = typeof d.pickup === "string" ? d.pickup : d.pickup?.address || "";
      const dropoff = typeof d.dropoff === "string" ? d.dropoff : d.dropoff?.address || "";
      return (
        d.id.toLowerCase().includes(q) ||
        (d.rider?.name || "").toLowerCase().includes(q) ||
        pickup.toLowerCase().includes(q) ||
        dropoff.toLowerCase().includes(q)
      );
    });
  }, [deliveries, search]);

  if (authLoading || checkingAdmin || !user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

  const stats = [
    { label: "Active now", value: activeDeliveries.length, sub: "deliveries in progress", icon: ICONS.truck, featured: true },
    { label: "Registered riders", value: riders.length, sub: "fleet size", icon: ICONS.riders },
    { label: "Total orders", value: deliveries.length, sub: "all time", icon: ICONS.package },
    {
      label: "Pending assignment",
      value: deliveries.filter((d) => d.status === "pending").length,
      sub: "awaiting rider",
      icon: ICONS.clock,
    },
  ];

  const adminName = userProfile?.name || user.displayName || "Admin";
  const adminInitials = adminName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navLinks = (
    <>
      <a href="#deliveries" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.package} className="h-4 w-4" />
        Deliveries
      </a>
      <a href="#riders" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.riders} className="h-4 w-4" />
        Riders
      </a>
      <Link href="/admin/team" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.admins} className="h-4 w-4" />
        Manage admins
      </Link>
      <Link href="/admin/riders" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.riders} className="h-4 w-4" />
        Rider requests
        {pendingRequests > 0 && (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-[#141019]">
            {pendingRequests}
          </span>
        )}
      </Link>
      <Link href="/admin/areas" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.pin} className="h-4 w-4" />
        Service areas
      </Link>
      {/* Strictly role === "superadmin", not hasAdminAccess() — a plain admin
          reaches this page too (WM-103: superadmin ⊃ admin), but pricing
          control is the one thing that stays a superadmin-only grant. */}
      {userProfile?.role === "superadmin" && (
        <Link href="/admin/pricing" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
          <Icon path={ICONS.grid} className="h-4 w-4" />
          Pricing
        </Link>
      )}
      <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
        <Icon path={ICONS.exit} className="h-4 w-4" />
        Exit
      </Link>
    </>
  );

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
        <div className="mt-1 flex items-center gap-3 rounded-xl bg-primary/20 px-3 py-2.5 text-sm font-semibold text-white">
          <Icon path={ICONS.grid} className="h-4 w-4 text-accent" />
          Dashboard
        </div>
        <nav className="mt-1 flex flex-col gap-1">{navLinks}</nav>

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

            <label className="hidden sm:flex flex-1 max-w-sm items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2">
              <Icon path={ICONS.search} className="h-4 w-4 text-white/35 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deliveries, riders, addresses..."
                className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
            </label>

            <div className="flex items-center gap-4">
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
          </div>

          {/* Mobile-only nav row */}
          <div className="flex lg:hidden items-center gap-5 px-6 pb-3 text-xs">
            <a href="#deliveries" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Deliveries</a>
            <a href="#riders" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Riders</a>
            <Link href="/admin/riders" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Requests {pendingRequests > 0 && `(${pendingRequests})`}</Link>
            <Link href="/admin/team" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Admins</Link>
            <Link href="/admin/areas" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Service areas</Link>
            <Link href="/" className="font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">Exit</Link>
          </div>
        </header>

        {pricingHealthy === false && (
          <div className="bg-red-600 text-white px-6 py-3 text-sm font-semibold flex flex-wrap items-center justify-center gap-2 text-center">
            <span>
              Pricing isn&apos;t configured — <strong>no customer can book a delivery right now.</strong>
            </span>
            <span className="text-white/80 font-normal">
              Run the seed script (see WM-104), or check server logs for why config/pricing is failing.
            </span>
          </div>
        )}

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
            <>
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold font-display">Dashboard</h1>
                  <p className="mt-1 text-sm text-white/45">Live view of your fleet, orders, and riders.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white/80 px-4 py-2.5 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Icon path={ICONS.refresh} className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  <Link
                    href="/admin/areas"
                    className="rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white/80 px-4 py-2.5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Service areas
                  </Link>
                  <Link
                    href="/admin/team"
                    className="rounded-xl bg-accent text-[#141019] text-sm font-bold px-4 py-2.5 hover:bg-accent-soft transition-colors cursor-pointer"
                  >
                    Manage admins
                  </Link>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className={`rounded-2xl p-5 ${s.featured ? "bg-gradient-to-br from-primary to-primary-soft" : "bg-white/5 border border-white/10"}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`text-[10px] font-bold tracking-[0.18em] uppercase ${s.featured ? "text-white/70" : "text-white/40"}`}>{s.label}</p>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.featured ? "bg-white/15" : "bg-white/10"}`}>
                        <Icon path={s.icon} className={`h-4 w-4 ${s.featured ? "text-accent-tint" : "text-white/70"}`} />
                      </span>
                    </div>
                    <p className="mt-2 text-3xl font-extrabold tabular-nums">{s.value}</p>
                    <p className={`text-xs ${s.featured ? "text-white/60" : "text-white/40"}`}>{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Charts row */}
              <div className="mt-6 grid lg:grid-cols-[1.4fr_1fr] gap-6">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Orders this week</p>
                  {hasWeekActivity ? (
                    <div className="mt-5 flex items-end justify-between gap-2 h-32">
                      {weekBuckets.map((b) => (
                        <div key={b.key} className="flex flex-1 flex-col items-center gap-2">
                          <div className="relative flex h-24 w-full items-end justify-center">
                            <div
                              className={`w-full max-w-8 rounded-full transition-all ${b.isToday ? "bg-accent" : "bg-primary-light/50"}`}
                              style={{ height: `${Math.max(8, b.pct)}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold ${b.isToday ? "text-accent" : "text-white/35"}`}>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 flex h-32 items-center justify-center text-sm text-white/35">
                      No orders placed yet this week.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Completion rate</p>
                  <div className="mt-3 flex items-center justify-center">
                    <div className="relative h-32 w-32">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
                        <circle
                          cx="60"
                          cy="60"
                          r={ringRadius}
                          fill="none"
                          stroke="#f16834"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeDasharray={`${(completionPct / 100) * ringCircumference} ${ringCircumference}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-extrabold tabular-nums">{completionPct}%</span>
                        <span className="text-[10px] text-white/40">Delivered</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-white/60">
                      <span className="h-2 w-2 rounded-full bg-accent" /> Delivered {deliveredCount}
                    </span>
                    <span className="flex items-center gap-1.5 text-white/60">
                      <span className="h-2 w-2 rounded-full bg-primary-light" /> Active {activeDeliveries.length}
                    </span>
                    <span className="flex items-center gap-1.5 text-white/60">
                      <span className="h-2 w-2 rounded-full bg-red-400" /> Cancelled {cancelledCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid lg:grid-cols-[1.2fr_1fr] gap-6">
                {/* Deliveries table */}
                <div id="deliveries" className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden scroll-mt-6">
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
                      Recent Deliveries
                    </p>
                    {search && (
                      <span className="text-[10px] text-white/35">{filteredDeliveries.length} match{filteredDeliveries.length === 1 ? "" : "es"}</span>
                    )}
                  </div>
                  {loading ? (
                    <div className="p-4 space-y-2" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  ) : filteredDeliveries.length === 0 ? (
                    <div className="p-10 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                        <Icon path={ICONS.package} className="h-6 w-6 text-white/40" />
                      </span>
                      <p className="mt-3 text-sm text-white/40">
                        {search ? "No deliveries match your search." : "No delivery orders created yet."}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] tracking-[0.14em] uppercase text-white/35">
                          <th className="px-5 py-2 font-bold">ID</th>
                          <th className="py-2 font-bold">Client / Rider</th>
                          <th className="py-2 font-bold">Status</th>
                          <th className="py-2 pr-5 font-bold text-right">Fare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeliveries.map((d) => {
                          const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-white/10 text-white/60" };
                          return (
                            <tr key={d.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-5 py-3">
                                <Link href={`/track/${d.id}`} className="font-bold text-white hover:text-accent transition-colors font-mono text-xs cursor-pointer">
                                  {d.id.slice(0, 8)}...
                                </Link>
                              </td>
                              <td className="py-3 text-white/70">
                                <span className="block text-xs font-semibold">{d.rider?.name || "Pending Rider"}</span>
                                <span className="block text-[10px] text-white/40">{typeof d.pickup === "string" ? d.pickup : d.pickup?.address}</span>
                              </td>
                              <td className="py-3">
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase ${meta.cls}`}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="py-3 pr-5 text-right text-white/70 tabular-nums">{formatQuote(d.quotedAmountKobo)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Registered Riders List */}
                <div id="riders" className="rounded-2xl bg-white/5 border border-white/10 p-5 scroll-mt-6">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
                    Registered Riders
                  </p>
                  {riders.length === 0 ? (
                    <div className="py-8 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                        <Icon path={ICONS.riders} className="h-6 w-6 text-white/40" />
                      </span>
                      <p className="mt-3 text-xs text-white/40">No riders registered in Firestore.</p>
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {riders.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                          <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-xs font-extrabold">
                            {r.initials}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white/85 text-sm truncate">{r.name}</p>
                            <p className="text-xs text-white/40">{r.deliveries} deliveries</p>
                          </div>
                          <span className="text-xs font-bold text-accent tabular-nums shrink-0">★ {r.rating.toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
