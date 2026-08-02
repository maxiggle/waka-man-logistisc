"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  addServiceArea,
  deleteServiceArea,
  listServiceAreas,
  setDefaultServiceArea,
  setServiceAreaActive,
  type ServiceArea,
} from "@/lib/serviceAreas";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { AddressSuggestion } from "@/lib/geocode";

export default function AdminAreasPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUserProfile } = useAuth();

  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AddressSuggestion | null>(null);
  const [areaName, setAreaName] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [rowError, setRowError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Re-check invite/admin status on every visit — see refreshUserProfile
  // in AuthContext.tsx for why this can't just rely on cached context state.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/admin/areas");
      return;
    }

    let cancelled = false;
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      const admin = profile?.role === "admin";
      setIsAdmin(admin);
      setCheckingAdmin(false);
      if (!admin) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router, refreshUserProfile]);

  async function refresh() {
    try {
      setAreas(await listServiceAreas());
    } catch (err) {
      console.error("Failed to refresh service areas:", err);
    }
  }

  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;

    async function load() {
      if (!isFirebaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        setAreas(await listServiceAreas());
      } catch (err) {
        console.error("Failed to load service areas:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, checkingAdmin, user, isAdmin]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setFormError("Pick a place from the suggestions list.");
      return;
    }
    setFormError("");
    setAdding(true);
    try {
      await addServiceArea({ name: areaName.trim() || selected.address, lat: selected.lat, lng: selected.lng });
      setQuery("");
      setSelected(null);
      setAreaName("");
      await refresh();
    } catch (err) {
      console.error("Failed to add service area:", err);
      setFormError(err instanceof Error ? err.message : "Failed to add service area.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setRowError("");
    setBusyId(id);
    try {
      await deleteServiceArea(id);
      await refresh();
    } catch (err) {
      console.error("Failed to delete service area:", err);
      setRowError(err instanceof Error ? err.message : "Failed to delete service area.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(area: ServiceArea) {
    setRowError("");
    setBusyId(area.id);
    try {
      await setServiceAreaActive(area.id, !area.active);
      await refresh();
    } catch (err) {
      console.error("Failed to update service area:", err);
      setRowError(err instanceof Error ? err.message : "Failed to update service area.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetDefault(id: string) {
    setRowError("");
    setBusyId(id);
    try {
      await setDefaultServiceArea(id);
      await refresh();
    } catch (err) {
      console.error("Failed to set default service area:", err);
      setRowError(err instanceof Error ? err.message : "Failed to set default service area.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || checkingAdmin || !user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#141019] text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark-white.png" alt="" className="h-8 w-auto" />
            <span>
              waka man
              <span className="block text-[9px] font-bold tracking-[0.3em] uppercase text-accent">
                Dispatch Admin
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/admin" className="font-semibold text-white/60 hover:text-white transition-colors">
              ← Back to dashboard
            </Link>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Coverage</p>
        <h1 className="mt-1 text-2xl font-extrabold">Service areas</h1>
        <p className="mt-2 text-sm text-white/50 max-w-xl">
          Areas bias address search and set the map&apos;s fallback centre. The default area is
          used whenever a customer&apos;s own location isn&apos;t already available. Areas do not
          restrict where a delivery can be booked.
        </p>

        <form onSubmit={handleAdd} className="mt-6 rounded-2xl bg-white p-5">
          <AddressAutocomplete
            id="new-area-address"
            label="Search for a place"
            value={query}
            onQueryChange={(q) => {
              setQuery(q);
              setSelected(null);
            }}
            onSelect={(s) => {
              setQuery(s.address);
              setSelected(s);
              setAreaName((prev) => prev || s.address);
            }}
            resolved={selected}
          />
          {selected && (
            <div className="mt-3">
              <label htmlFor="area-name" className="text-sm font-semibold text-ink/70">
                Area name
              </label>
              <input
                id="area-name"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Port Harcourt"
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={adding}
            className="mt-4 rounded-xl bg-accent text-[#141019] font-bold text-sm px-5 py-3 hover:bg-accent-soft transition-colors disabled:opacity-50 cursor-pointer"
          >
            {adding ? "Adding..." : "Add area"}
          </button>
        </form>

        {rowError && <p className="mt-4 text-sm text-red-400">{rowError}</p>}

        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
            Areas
          </p>
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm animate-pulse">Loading areas...</div>
          ) : areas.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">
              No service areas yet — search above to add one.
            </div>
          ) : (
            <ul>
              {areas.map((area) => (
                <li
                  key={area.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {area.name}
                      {area.isDefault && (
                        <span className="rounded bg-accent/20 text-accent text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                          Default
                        </span>
                      )}
                      {!area.active && (
                        <span className="rounded bg-white/10 text-white/50 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-white/40 tabular-nums">
                      {area.lat.toFixed(4)}, {area.lng.toFixed(4)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    {!area.isDefault && (
                      <button
                        onClick={() => handleSetDefault(area.id)}
                        disabled={busyId === area.id}
                        className="text-white/60 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(area)}
                      disabled={busyId === area.id}
                      className="text-white/60 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {area.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDelete(area.id)}
                      disabled={busyId === area.id}
                      className="text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {busyId === area.id ? "Working..." : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
