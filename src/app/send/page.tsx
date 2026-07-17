"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDelivery } from "@/lib/demo";

const vehicles = [
  { key: "express", name: "Express", meta: "Motorbike · pickup in ~4 min", fare: "₦1,500", hot: true },
  { key: "standard", name: "Standard", meta: "Scooter · pickup in ~9 min", fare: "₦900", hot: false },
  { key: "bulk", name: "Bulk", meta: "Car · pickup in ~14 min", fare: "₦2,400", hot: false },
] as const;

export default function SendPage() {
  const router = useRouter();
  const [pickup, setPickup] = useState("14 Adeola Odeku St, Victoria Island");
  const [dropoff, setDropoff] = useState("3 Allen Avenue, Ikeja");
  const [vehicle, setVehicle] = useState<(typeof vehicles)[number]["key"]>("express");
  const [requesting, setRequesting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requesting) return;
    setRequesting(true);
    const d = createDelivery({ pickup, dropoff, vehicle });
    // Brief "finding a rider" beat, then straight into live tracking.
    setTimeout(() => router.push(`/track/${d.id}`), 1600);
  };

  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold text-ink/60 hover:text-primary transition-colors">
            ← Dashboard
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">New delivery</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          Send a package
        </h1>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="pickup" className="text-sm font-semibold text-ink/70">Pickup address</label>
            <input
              id="pickup"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor="dropoff" className="text-sm font-semibold text-ink/70">Drop-off address</label>
            <input
              id="dropoff"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <fieldset className="pt-2">
            <legend className="text-sm font-semibold text-ink/70">Vehicle</legend>
            <div className="mt-2 space-y-2.5">
              {vehicles.map((v) => (
                <label
                  key={v.key}
                  className={`flex items-center justify-between rounded-xl border bg-white px-4 py-3.5 cursor-pointer transition-colors ${
                    vehicle === v.key ? "border-accent ring-2 ring-accent/20" : "border-ink/15 hover:border-ink/30"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="vehicle"
                      value={v.key}
                      checked={vehicle === v.key}
                      onChange={() => setVehicle(v.key)}
                      className="accent-[#f16834]"
                    />
                    <span>
                      <span className="font-bold text-ink">{v.name}</span>
                      {v.hot && (
                        <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-extrabold text-white align-middle">
                          FASTEST
                        </span>
                      )}
                      <span className="block text-xs text-ink/50">{v.meta}</span>
                    </span>
                  </span>
                  <span className="font-bold text-primary">{v.fare}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={requesting}
            className="w-full rounded-xl bg-accent text-ink font-semibold py-4 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-80 disabled:cursor-wait"
          >
            {requesting ? "Finding you a rider…" : `Request rider · ${vehicles.find((v) => v.key === vehicle)?.fare}`}
          </button>
          {requesting && (
            <p className="text-center text-sm text-ink/55 animate-pulse">
              Matching the nearest available rider…
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
