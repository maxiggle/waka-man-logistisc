"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DeliveryItem, DeliveryStatus } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";
import { STATUS_META, addressOf, fetchRecentDeliveries } from "@/lib/adminData";
import AdminShell, { ICONS, Icon } from "@/components/admin/AdminShell";

const PAGE_SIZE = 100;

export default function AdminDeliveriesPage() {
  const [search, setSearch] = useState("");
  return (
    <AdminShell search={search} onSearchChange={setSearch} searchPlaceholder="Search by ID, rider or address...">
      <Deliveries search={search} />
    </AdminShell>
  );
}

function Deliveries({ search }: { search: string }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");

  useEffect(() => {
    fetchRecentDeliveries(PAGE_SIZE)
      .then(setDeliveries)
      .catch((err) => {
        console.error("Failed to load deliveries:", err);
        setError("Couldn't load deliveries. Try refreshing.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        (d.rider?.name || "").toLowerCase().includes(q) ||
        addressOf(d.pickup).toLowerCase().includes(q) ||
        addressOf(d.dropoff).toLowerCase().includes(q)
      );
    });
  }, [deliveries, search, status]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-display">Deliveries</h1>
          <p className="mt-1 text-sm text-white/45">
            {loading ? "Loading..." : `Showing ${filtered.length} of the ${deliveries.length} most recent orders.`}
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DeliveryStatus | "all")}
          aria-label="Filter by status"
          className="rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-white/80 px-4 py-2.5 focus:outline-none cursor-pointer"
        >
          <option value="all" className="bg-[#141019]">All statuses</option>
          {(Object.keys(STATUS_META) as DeliveryStatus[]).map((s) => (
            <option key={s} value={s} className="bg-[#141019]">{STATUS_META[s].label}</option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Icon path={ICONS.package} className="h-6 w-6 text-white/40" />
            </span>
            <p className="mt-3 text-sm text-white/40">
              {search || status !== "all" ? "No deliveries match your filters." : "No delivery orders created yet."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.14em] uppercase text-white/35">
                <th className="px-5 py-3 font-bold">ID</th>
                <th className="py-3 font-bold">Rider</th>
                <th className="py-3 font-bold">Pickup</th>
                <th className="py-3 font-bold">Dropoff</th>
                <th className="py-3 font-bold">Status</th>
                <th className="py-3 pr-5 font-bold text-right">Fare</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-white/10 text-white/60" };
                return (
                  <tr key={d.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/track/${d.id}`} className="font-bold text-white hover:text-accent transition-colors font-mono text-xs cursor-pointer">
                        {d.id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="py-3 text-xs font-semibold text-white/70">{d.rider?.name || "Pending Rider"}</td>
                    <td className="py-3 pr-3 text-xs text-white/50 max-w-[220px] truncate">{addressOf(d.pickup)}</td>
                    <td className="py-3 pr-3 text-xs text-white/50 max-w-[220px] truncate">{addressOf(d.dropoff)}</td>
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
    </>
  );
}
