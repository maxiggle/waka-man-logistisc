"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRiderStats, type RiderStat } from "@/lib/adminData";
import AdminShell, { ICONS, Icon } from "@/components/admin/AdminShell";

export default function AdminFleetPage() {
  const [search, setSearch] = useState("");
  return (
    <AdminShell search={search} onSearchChange={setSearch} searchPlaceholder="Search riders...">
      <Fleet search={search} />
    </AdminShell>
  );
}

function Fleet({ search }: { search: string }) {
  const [riders, setRiders] = useState<RiderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRiderStats()
      .then(setRiders)
      .catch((err) => {
        console.error("Failed to load riders:", err);
        setError("Couldn't load riders. Try refreshing.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? riders.filter((r) => r.name.toLowerCase().includes(q)) : riders;
    return [...list].sort((a, b) => b.deliveries - a.deliveries);
  }, [riders, search]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold font-display">Riders</h1>
        <p className="mt-1 text-sm text-white/45">
          {loading ? "Loading..." : `${riders.length} registered rider${riders.length === 1 ? "" : "s"}.`}
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-5">
        {loading ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Icon path={ICONS.riders} className="h-6 w-6 text-white/40" />
            </span>
            <p className="mt-3 text-xs text-white/40">
              {search ? "No riders match your search." : "No riders registered in Firestore."}
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-xs font-extrabold">
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
    </>
  );
}
