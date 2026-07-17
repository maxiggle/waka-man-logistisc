"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Delivery } from "@/lib/demo";

// Right-angled "street" route through the map viewBox (0 0 400 520).
const ROUTE_D = "M 64 56 L 64 168 L 208 168 L 208 300 L 336 300 L 336 452";

const STAGES = [
  { key: "assigned", label: "Confirmed" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
] as const;

function stageFromProgress(p: number, startedAtPickup: boolean): number {
  if (p >= 1) return 3;
  if (p > 0.06 || !startedAtPickup) return 2;
  if (p > 0) return 1;
  return startedAtPickup ? 1 : 0;
}

export default function LiveTracking({ delivery }: { delivery: Delivery }) {
  const pathRef = useRef<SVGPathElement>(null);
  const doneRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<SVGGElement>(null);
  const [progress, setProgress] = useState(delivery.startProgress);
  const [rated, setRated] = useState(0);

  // Simulated live movement: advance from startProgress to 1 over `duration`.
  useEffect(() => {
    if (delivery.startProgress >= 1 || delivery.status === "assigned") {
      // Delivered already, or rider not yet at pickup — no route animation.
      setProgress(delivery.startProgress);
      return;
    }
    // Wall-clock interval (not rAF): keeps advancing even when the tab is
    // throttled, and resumes at the correct position after backgrounding.
    const t0 = performance.now();
    const span = 1 - delivery.startProgress;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const p = Math.min(1, delivery.startProgress + span * (elapsed / delivery.duration));
      setProgress(p);
      if (p >= 1) clearInterval(timer);
    }, 80);
    return () => clearInterval(timer);
  }, [delivery]);

  // Imperative SVG updates (cheap: small path, small area).
  useEffect(() => {
    const path = pathRef.current;
    const done = doneRef.current;
    const marker = markerRef.current;
    if (!path || !done || !marker) return;
    const total = path.getTotalLength();
    const at = total * progress;
    done.style.strokeDasharray = `${at} ${total}`;
    const pt = path.getPointAtLength(at);
    marker.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
  }, [progress]);

  const startedAtPickup = delivery.status !== "assigned";
  const stage = stageFromProgress(progress, startedAtPickup);
  const delivered = stage === 3;
  const minsLeft = Math.max(1, Math.ceil((1 - progress) * delivery.duration / 8));

  return (
    <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6">
      {/* Map */}
      <div className="relative rounded-3xl overflow-hidden bg-[#1a1626] min-h-[420px] lg:min-h-[560px]">
        <svg viewBox="0 0 400 520" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* street grid */}
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#241f31" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="400" height="520" fill="url(#grid)" />
          {/* remaining route (dashed) */}
          <path ref={pathRef} d={ROUTE_D} fill="none" stroke="#3d3550" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" />
          {/* travelled route (solid orange) */}
          <path ref={doneRef} d={ROUTE_D} fill="none" stroke="#f16834" strokeWidth="6" strokeLinecap="round" />
          {/* pickup + dropoff pins */}
          <g transform="translate(64,56)">
            <circle r="12" fill="#f16834" opacity="0.25" />
            <circle r="6" fill="#f16834" />
          </g>
          <g transform="translate(336,452)">
            <circle r="12" fill="#8a6fc4" opacity="0.3" />
            <circle r="6" fill="#8a6fc4" />
          </g>
          {/* rider marker */}
          <g ref={markerRef}>
            <circle r="16" fill="#f16834" opacity="0.25">
              <animate attributeName="r" values="14;20;14" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="9" fill="#f16834" stroke="#fff" strokeWidth="2.5" />
          </g>
        </svg>
        <div className="absolute top-4 left-4 rounded-full bg-black/40 backdrop-blur px-4 py-1.5 text-xs font-semibold text-white/90">
          {delivered ? "Route completed" : "Live · Lagos"}
          {!delivered && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />}
        </div>
        <p className="absolute bottom-3 right-4 text-[10px] text-white/30">Demo — simulated route</p>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl bg-[#17141f] text-white p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center font-extrabold">
              {delivery.rider.initials}
            </div>
            <div className="flex-1">
              <p className="font-bold">
                {delivered
                  ? `Delivered by ${delivery.rider.name}`
                  : stage === 1 && !startedAtPickup
                    ? `${delivery.rider.name} is heading to pickup`
                    : `${delivery.rider.name} is ${minsLeft} min away`}
              </p>
              <p className="text-sm text-white/50">
                {delivery.rider.vehicle} · {delivery.rider.plate} · ★ {delivery.rider.rating.toFixed(1)}
              </p>
            </div>
          </div>

          {/* Status stepper */}
          <div className="mt-6 flex items-center">
            {STAGES.map((s, i) => (
              <div key={s.key} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                {i > 0 && <div className={`h-0.5 flex-1 ${i <= stage ? "bg-accent" : "bg-white/15"}`} />}
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${i <= stage ? "bg-accent" : "bg-white/15"}`} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-white/40">
            {STAGES.map((s, i) => (
              <span key={s.key} className={i === stage ? "text-accent font-bold" : ""}>{s.label}</span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-ink/10 p-6">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Delivery {delivery.id}</p>
          <div className="mt-4 flex gap-3">
            <div className="flex flex-col items-center pt-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="w-0.5 flex-1 bg-ink/10 my-1" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary-light" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="font-semibold text-ink">{delivery.pickup}</p>
                <p className="text-xs text-ink/45">Pickup</p>
              </div>
              <div>
                <p className="font-semibold text-ink">{delivery.dropoff}</p>
                <p className="text-xs text-ink/45">Drop-off · {delivery.packageNote}</p>
              </div>
            </div>
            <p className="font-bold text-primary">{delivery.fare}</p>
          </div>
        </div>

        {delivered ? (
          <div className="rounded-3xl bg-white border border-ink/10 p-6">
            <p className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 text-center">
              Confirmed with code {delivery.code}
            </p>
            <p className="mt-5 font-bold text-ink text-center">Rate your delivery</p>
            <div className="mt-3 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRated(n)}
                  aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                  className={`text-3xl cursor-pointer transition-colors ${n <= rated ? "text-accent" : "text-ink/15 hover:text-accent-tint"}`}
                >
                  ★
                </button>
              ))}
            </div>
            {rated > 0 && (
              <p className="mt-3 text-center text-sm text-ink/55">
                Thanks — your {rated}-star rating goes on {delivery.rider.name}&apos;s record.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-ink/10 p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Confirmation code</p>
              <p className="mt-1 text-sm text-ink/55 max-w-[26ch]">Give this to the rider at the door to confirm delivery.</p>
            </div>
            <p className="font-display text-3xl font-extrabold tracking-[0.2em] text-primary tabular-nums">{delivery.code}</p>
          </div>
        )}

        <Link href="/track" className="text-center text-sm font-semibold text-ink/50 hover:text-primary transition-colors">
          Track another delivery
        </Link>
      </div>
    </div>
  );
}
