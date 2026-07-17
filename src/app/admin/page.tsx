"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deliveries, riders } from "@/lib/demo";

const FLEET = [
  { id: 1, x: 22, y: 18, busy: true },
  { id: 2, x: 56, y: 42, busy: true },
  { id: 3, x: 34, y: 66, busy: true },
  { id: 4, x: 74, y: 30, busy: false },
  { id: 5, x: 70, y: 74, busy: false },
  { id: 6, x: 12, y: 55, busy: true },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  in_transit: { label: "In transit", cls: "bg-accent/15 text-accent" },
  assigned: { label: "Awaiting pickup", cls: "bg-amber-400/15 text-amber-600" },
  delivered: { label: "Delivered", cls: "bg-emerald-400/15 text-emerald-600" },
};

export default function AdminPage() {
  const [tick, setTick] = useState(0);

  // Gentle marker drift so the fleet map feels alive.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1200);
    return () => clearInterval(t);
  }, []);

  const busy = FLEET.filter((f) => f.busy).length;

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
                Dispatch
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <span className="hidden sm:flex items-center gap-2 text-white/50">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live · demo data
            </span>
            <Link href="/" className="font-semibold text-white/60 hover:text-white transition-colors">
              Exit
            </Link>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Active now", String(deliveries.filter((d) => d.status !== "delivered").length), "deliveries in progress", ""],
            ["Riders online", String(FLEET.length), `${FLEET.length - busy} free · ${busy} on jobs`, ""],
            ["On-time today", "97.4%", "▲ 1.2% vs last week", "text-emerald-400"],
            ["Needs attention", "1", "stalled > 10 min", "text-amber-400"],
          ].map(([label, value, sub, cls]) => (
            <div key={label} className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">{label}</p>
              <p className={`mt-1 text-3xl font-extrabold tabular-nums ${cls || ""}`}>{value}</p>
              <p className={`text-xs ${cls || "text-white/45"}`}>{sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid lg:grid-cols-[1.2fr_1fr] gap-6">
          {/* Fleet map */}
          <div className="relative rounded-2xl overflow-hidden bg-[#1a1626] border border-white/10 min-h-[380px]">
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <pattern id="agrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#241f31" strokeWidth="1.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#agrid)" />
            </svg>
            <p className="absolute top-4 left-4 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
              Lagos · live fleet
            </p>
            <div className="absolute bottom-4 left-4 flex gap-4 text-[11px] text-white/50">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> On a job</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary-light" /> Free</span>
            </div>
            {FLEET.map((f) => (
              <span
                key={f.id}
                className={`absolute h-5 w-5 rounded-full border-2 border-white transition-all duration-1000 ease-in-out ${
                  f.busy ? "bg-accent shadow-[0_0_0_6px_rgba(241,104,52,0.25)]" : "bg-primary-light shadow-[0_0_0_6px_rgba(120,94,167,0.2)]"
                }`}
                style={{
                  left: `${f.x + Math.sin(tick * 1.7 + f.id) * (f.busy ? 3 : 0.6)}%`,
                  top: `${f.y + Math.cos(tick * 1.3 + f.id * 2) * (f.busy ? 3 : 0.6)}%`,
                }}
              />
            ))}
          </div>

          {/* Deliveries table */}
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
              Today&apos;s deliveries
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.14em] uppercase text-white/35">
                  <th className="px-5 py-2 font-bold">ID</th>
                  <th className="py-2 font-bold">Rider</th>
                  <th className="py-2 font-bold">Status</th>
                  <th className="py-2 pr-5 font-bold text-right">Fare</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/track/${d.id}`} className="font-bold text-white hover:text-accent transition-colors">
                        {d.id}
                      </Link>
                    </td>
                    <td className="py-3 text-white/70">{d.rider.name}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide uppercase ${STATUS_META[d.status]?.cls ?? "bg-white/10 text-white/60"}`}>
                        {STATUS_META[d.status]?.label ?? d.status}
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-right text-white/70 tabular-nums">{d.fare}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 border-t border-white/10">
              Top riders
            </p>
            <ul className="pb-3">
              {riders.slice(0, 3).map((r) => (
                <li key={r.name} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-xs font-extrabold">
                    {r.initials}
                  </span>
                  <span className="flex-1 font-semibold text-white/85">{r.name}</span>
                  <span className="text-xs text-white/50 tabular-nums">{r.deliveries.toLocaleString()} trips</span>
                  <span className="text-xs font-bold text-accent tabular-nums">★ {r.rating.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
