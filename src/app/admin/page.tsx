"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DeliveryItem } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";
import { fetchPricingStatus } from "@/lib/pricingAdmin";
import {
  STATUS_META,
  addressOf,
  fetchRecentDeliveries,
  fetchRiderStats,
  type RiderStat,
} from "@/lib/adminData";
import AdminShell, { ICONS, Icon } from "@/components/admin/AdminShell";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// The dashboard only previews the most recent activity; the full lists live
// on /admin/deliveries and /admin/fleet.
const PREVIEW_DELIVERIES = 20;
const PREVIEW_RIDERS = 8;

export default function AdminPage() {
  const [search, setSearch] = useState("");
  return (
    <AdminShell search={search} onSearchChange={setSearch} searchPlaceholder="Search deliveries, riders, addresses...">
      <Dashboard search={search} />
    </AdminShell>
  );
}

function Dashboard({ search }: { search: string }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [riders, setRiders] = useState<RiderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // null = not checked yet (or the check itself failed) — deliberately not
  // treated as unhealthy, so a transient network blip doesn't flash a false
  // "booking is down" banner. Only an explicit `false` from the API means that.
  const [pricingHealthy, setPricingHealthy] = useState<boolean | null>(null);

  const fetchAdminData = useCallback(async () => {
    try {
      const [delList, riderList] = await Promise.all([fetchRecentDeliveries(PREVIEW_DELIVERIES), fetchRiderStats()]);
      setDeliveries(delList);
      setRiders(riderList);
    } catch (err) {
      console.error("Admin data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Admin data fetching safely updates state
    fetchAdminData().catch(console.error);
  }, [fetchAdminData]);

  // WM-104: config/pricing missing/invalid means every booking 422s with no
  // other visible symptom — this is what makes that an unmissable banner
  // instead of something an operator only discovers from a customer complaint.
  useEffect(() => {
    fetchPricingStatus()
      .then((status) => setPricingHealthy(status.healthy))
      .catch((err) => console.error("Failed to check pricing config health:", err));
  }, []);

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
      const pickup = addressOf(d.pickup);
      const dropoff = addressOf(d.dropoff);
      return (
        d.id.toLowerCase().includes(q) ||
        (d.rider?.name || "").toLowerCase().includes(q) ||
        pickup.toLowerCase().includes(q) ||
        dropoff.toLowerCase().includes(q)
      );
    });
  }, [deliveries, search]);

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

  return (
    <>
      {pricingHealthy === false && (
        <div className="mb-6 rounded-2xl bg-red-600 text-white px-6 py-3 text-sm font-semibold flex flex-wrap items-center justify-center gap-2 text-center">
          <span>
            Pricing isn&apos;t configured — <strong>no customer can book a delivery right now.</strong>
          </span>
          <span className="text-white/80 font-normal">
            Run the seed script (see WM-104), or check server logs for why config/pricing is failing.
          </span>
        </div>
      )}
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
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
              Recent Deliveries
            </p>
            {search ? (
              <span className="text-[10px] text-white/35">{filteredDeliveries.length} match{filteredDeliveries.length === 1 ? "" : "es"}</span>
            ) : (
              <Link href="/admin/deliveries" className="text-[11px] font-bold text-accent hover:underline">View all</Link>
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
                        <span className="block text-[10px] text-white/40">{addressOf(d.pickup)}</span>
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
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
              Registered Riders
            </p>
            <Link href="/admin/fleet" className="text-[11px] font-bold text-accent hover:underline">View all</Link>
          </div>
          {riders.length === 0 ? (
            <div className="py-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <Icon path={ICONS.riders} className="h-6 w-6 text-white/40" />
              </span>
              <p className="mt-3 text-xs text-white/40">No riders registered in Firestore.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {riders.slice(0, PREVIEW_RIDERS).map((r) => (
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
  );
}
