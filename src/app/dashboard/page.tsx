"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { DeliveryItem, DeliveryStatus } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";

const STATUS_META: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: "Pending rider", cls: "bg-primary/10 text-primary" },
  offered: { label: "Offer sent", cls: "bg-primary/10 text-primary" },
  assigned: { label: "Rider assigned", cls: "bg-amber-100 text-amber-700" },
  picked_up: { label: "Picked up", cls: "bg-amber-100 text-amber-700" },
  in_transit: { label: "In transit", cls: "bg-accent/15 text-accent" },
  arrived: { label: "Arrived", cls: "bg-accent/15 text-accent" },
  delivered: { label: "Delivered", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-600" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading, signOut, refreshUserProfile } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/dashboard");
      return;
    }

    let cancelled = false;

    async function loadUserDeliveries() {
      if (!user || !isFirebaseConfigured || !db) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, "deliveries"),
          where("clientId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: DeliveryItem[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as DeliveryItem));
        setDeliveries(list);
      } catch (err) {
        console.error("Failed to load user deliveries:", err);
      } finally {
        setLoading(false);
      }
    }

    // Re-check invite/admin status on every dashboard visit — an invite
    // added while already signed in doesn't retroactively fire
    // onAuthStateChanged, so this is what actually promotes and redirects.
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      if (profile?.role === "admin") {
        router.replace("/admin");
        return;
      }
      await loadUserDeliveries();
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router, refreshUserProfile]);

  const displayName = userProfile?.name || user?.displayName || user?.email || "there";
  const firstName = displayName.split(" ")[0];
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const activeCount = deliveries.filter((d) => d.status !== "delivered" && d.status !== "cancelled").length;
  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;

  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2.5">
              {userProfile?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userProfile.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-[11px] font-extrabold text-white">
                  {initials || "WM"}
                </span>
              )}
              <span className="text-sm font-semibold text-ink/70">{firstName}</span>
            </div>
            <button
              onClick={() => signOut()}
              aria-label="Sign out"
              className="flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-primary transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H8.25m9.75 0-3-3m3 3-3 3" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        {/* Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Dashboard</p>
            <h1 className="mt-2 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary font-display">
              Welcome back, {firstName}
            </h1>
          </div>

          {/* Quick stats */}
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white border border-ink/10 px-5 py-3 shadow-sm">
              <p className="text-2xl font-extrabold text-primary tabular-nums">{activeCount}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">Active</p>
            </div>
            <div className="rounded-2xl bg-white border border-ink/10 px-5 py-3 shadow-sm">
              <p className="text-2xl font-extrabold text-primary tabular-nums">{deliveredCount}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">Delivered</p>
            </div>
            <div className="rounded-2xl bg-white border border-ink/10 px-5 py-3 shadow-sm">
              <p className="text-2xl font-extrabold text-primary tabular-nums">{deliveries.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">Total</p>
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <Link
            href="/send"
            className="group relative overflow-hidden rounded-3xl bg-primary p-7 text-white transition-colors hover:bg-primary-soft cursor-pointer"
          >
            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/5" aria-hidden />
            <div className="absolute -right-2 top-10 h-20 w-20 rounded-full bg-accent/20" aria-hidden />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9m-8.25-9v9l8.25 4.5" />
                  </svg>
                </span>
                <p className="mt-4 font-bold text-lg font-display">Send a package</p>
                <p className="mt-1 text-sm text-white/70 max-w-[30ch]">
                  Set pickup and drop-off, pick a vehicle, and watch your rider move.
                </p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-accent-tint transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </Link>

          <Link
            href="/track"
            className="group relative rounded-3xl bg-white border border-ink/10 p-7 transition-colors hover:border-accent/50 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </span>
                <p className="mt-4 font-bold text-lg text-primary font-display">Track a delivery</p>
                <p className="mt-1 text-sm text-ink/55 max-w-[30ch]">
                  Enter a tracking number or open one of your active deliveries.
                </p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-ink/25 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Deliveries */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary font-display">Your deliveries</h2>
            {deliveries.length > 0 && (
              <Link href="/track" className="text-xs font-semibold text-ink/50 hover:text-primary transition-colors">
                View all
              </Link>
            )}
          </div>

          {loading ? (
            <div className="mt-4 space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[72px] rounded-2xl bg-white border border-ink/10 animate-pulse" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <div className="mt-4 rounded-3xl bg-white border border-ink/10 p-10 text-center shadow-sm">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9m-8.25-9v9l8.25 4.5" />
                </svg>
              </span>
              <p className="mt-4 text-sm font-semibold text-ink/70">No deliveries yet</p>
              <p className="mt-1 text-sm text-ink/45">Once you send a package, it&apos;ll show up here.</p>
              <Link
                href="/send"
                className="mt-5 inline-block rounded-xl bg-primary text-white font-semibold text-sm px-5 py-2.5 hover:bg-primary-soft transition-colors cursor-pointer"
              >
                Send your first package
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {deliveries.map((d) => {
                const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-ink/5 text-ink/60" };
                return (
                  <Link
                    key={d.id}
                    href={`/track/${d.id}`}
                    className="group flex items-center gap-4 rounded-2xl bg-white border border-ink/10 px-5 py-4 hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <span className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9m-8.25-9v9l8.25 4.5" />
                      </svg>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-ink/40">{d.id.slice(0, 8)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-ink">
                        {typeof d.dropoff === "string" ? d.dropoff : d.dropoff?.address}
                      </p>
                      <p className="text-xs text-ink/45">{d.packageNote || "Package"}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary tabular-nums">{formatQuote(d.quotedAmountKobo)}</p>
                    </div>

                    <svg className="hidden sm:block h-4 w-4 shrink-0 text-ink/20 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
