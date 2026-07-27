"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

type RiderRecord = {
  id: string;
  name: string;
  initials: string;
  deliveries: number;
  rating: number;
  onTime: number;
};

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRiders() {
      if (!isFirebaseConfigured || !db) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, "users"), where("role", "==", "rider"));
        const snap = await getDocs(q);
        const list: RiderRecord[] = snap.docs.map((doc) => {
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
            onTime: data.onTimeRate || 99.0,
          };
        });
        setRiders(list);
      } catch (err) {
        console.error("Failed to load riders from Firestore:", err);
      } finally {
        setLoading(false);
      }
    }
    loadRiders();
  }, []);

  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <Link href="/" className="text-sm font-semibold text-ink/60 hover:text-primary transition-colors">
            ← Back home
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Rider records</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          Every rider, fully transparent
        </h1>
        <p className="mt-3 text-ink/60 max-w-xl">
          Deliveries completed, on-time rate, and client ratings — earned one drop-off
          at a time, visible to everyone.
        </p>

        {loading ? (
          <div className="mt-10 p-12 text-center text-ink/50 animate-pulse font-medium">
            Loading active rider records...
          </div>
        ) : riders.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white border border-ink/10 p-10 text-center shadow-sm">
            <p className="font-bold text-ink text-lg">No riders registered yet</p>
            <p className="mt-2 text-sm text-ink/60 max-w-md mx-auto">
              Be among the pioneer riders building a verified performance record on Waka-Man Logistics.
            </p>
            <Link
              href="/register?as=rider"
              className="mt-6 inline-block rounded-full bg-accent text-ink font-semibold px-7 py-3 hover:bg-accent-soft transition-colors"
            >
              Apply as a pioneer rider
            </Link>
          </div>
        ) : (
          <ol className="mt-10 space-y-3">
            {riders.map((r, i) => (
              <li
                key={r.id}
                className="flex items-center gap-4 rounded-2xl bg-white border border-ink/10 px-5 py-4 shadow-sm"
              >
                <span className="w-6 text-sm font-bold text-ink/30 tabular-nums">{i + 1}</span>
                <span className="h-11 w-11 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-sm font-extrabold text-white">
                  {r.initials}
                </span>
                <div className="flex-1">
                  <p className="font-bold text-ink">{r.name}</p>
                  <p className="text-xs text-ink/50">{r.deliveries.toLocaleString()} deliveries</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-accent tabular-nums">★ {r.rating.toFixed(1)}</p>
                  <p className="text-xs text-ink/50 tabular-nums">{r.onTime}% on time</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-10 rounded-2xl bg-primary text-white p-8 text-center shadow-md">
          <h2 className="text-xl font-extrabold">Want your name on this list?</h2>
          <p className="mt-2 text-white/70 text-sm">Your record rides with you — start building it today.</p>
          <Link
            href="/register?as=rider"
            className="mt-5 inline-block rounded-full bg-accent text-ink font-semibold px-7 py-3 hover:bg-accent-soft transition-colors"
          >
            Apply as a rider
          </Link>
        </div>
      </div>
    </main>
  );
}
