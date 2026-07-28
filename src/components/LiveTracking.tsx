"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { DeliveryItem } from "@/lib/schemas";
import { subscribeToPosition } from "@/lib/tracking";
import { hasMapbox } from "@/lib/mapbox";
import type { RiderPosition } from "@/lib/native/rider-location";

// mapbox-gl touches window at import — load it client-side only.
const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

// Lagos bounding box used to project live GPS fixes into the map viewBox.
const GEO = { latMin: 6.38, latMax: 6.72, lngMin: 3.1, lngMax: 3.65 };
const VIEW = { w: 400, h: 520, pad: 40 };

function projectToViewBox(pos: RiderPosition): { x: number; y: number } {
  const nx = (pos.lng - GEO.lngMin) / (GEO.lngMax - GEO.lngMin);
  const ny = (GEO.latMax - pos.lat) / (GEO.latMax - GEO.latMin); // lat grows north, y grows down
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: VIEW.pad + clamp(nx) * (VIEW.w - VIEW.pad * 2),
    y: VIEW.pad + clamp(ny) * (VIEW.h - VIEW.pad * 2),
  };
}

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

export default function LiveTracking({ delivery }: { delivery: DeliveryItem }) {
  const pathRef = useRef<SVGPathElement>(null);
  const doneRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<SVGGElement>(null);
  const startProgress = delivery.startProgress ?? 0;
  const duration = delivery.duration ?? 80;

  const [progress, setProgress] = useState(startProgress);
  const [rated, setRated] = useState(0);
  const [livePos, setLivePos] = useState<RiderPosition | null>(null);
  const live = livePos !== null;

  // Real rider positions, when a rider is broadcasting for this delivery.
  // First live fix permanently switches the map off the simulation.
  useEffect(() => {
    return subscribeToPosition(delivery.id, setLivePos);
  }, [delivery.id]);

  // Simulated live movement: advance from startProgress to 1 over `duration`.
  useEffect(() => {
    if (live) return; // real GPS has taken over
    if (startProgress >= 1 || delivery.status === "assigned") {
      // Delivered already, or rider not yet at pickup — no route animation.
      setProgress(startProgress);
      return;
    }
    // Wall-clock interval (not rAF): keeps advancing even when the tab is
    // throttled, and resumes at the correct position after backgrounding.
    const t0 = performance.now();
    const span = 1 - startProgress;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const p = Math.min(1, startProgress + span * (elapsed / duration));
      setProgress(p);
      if (p >= 1) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [delivery.id, delivery.status, startProgress, duration, live]);

  // Imperative SVG updates (cheap: small path, small area).
  useEffect(() => {
    const path = pathRef.current;
    const done = doneRef.current;
    const marker = markerRef.current;
    if (!path || !done || !marker) return;
    if (livePos) {
      const pt = projectToViewBox(livePos);
      done.style.strokeDasharray = `0 ${path.getTotalLength()}`;
      marker.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
      return;
    }
    const total = path.getTotalLength();
    const at = total * progress;
    done.style.strokeDasharray = `${at} ${total}`;
    const pt = path.getPointAtLength(at);
    marker.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
  }, [progress, livePos]);

  const startedAtPickup = delivery.status !== "assigned";
  // Live GPS carries no route progress — hold the stepper at "In transit"
  // instead of inheriting whatever the abandoned simulation reached.
  const stage = live ? 2 : stageFromProgress(progress, startedAtPickup);
  const delivered = stage === 3;
  // Real Mapbox map only when a rider is live and a token is configured;
  // otherwise the SVG route (demo simulation) still runs.
  const showMap = live && livePos !== null && hasMapbox();
  const minsLeft = Math.max(1, Math.ceil(((1 - progress) * duration) / 8));

  return (
    <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6">
      {/* Map */}
      <div className="relative rounded-3xl overflow-hidden bg-[#1a1626] min-h-[420px] lg:min-h-[560px]">
        {showMap ? (
          <LiveMap position={livePos} />
        ) : (
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
        )}
        <div className="absolute top-4 left-4 z-10 rounded-full bg-black/40 backdrop-blur px-4 py-1.5 text-xs font-semibold text-white/90">
          {live ? "Live GPS" : delivered ? "Route completed" : "Live · Lagos"}
          {(live || !delivered) && (
            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
          )}
        </div>
        {live ? (
          <p className="absolute bottom-3 right-4 z-10 text-[10px] text-white/40 tabular-nums">
            {livePos.lat.toFixed(5)}, {livePos.lng.toFixed(5)} · updated{" "}
            {new Date(livePos.timestamp).toLocaleTimeString()}
          </p>
        ) : (
          <p className="absolute bottom-3 right-4 text-[10px] text-white/30">Demo — simulated route</p>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl bg-[#17141f] text-white p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center font-extrabold text-lg">
              {delivery.rider?.initials || (delivery.rider?.name ? delivery.rider.name[0] : "WM")}
            </div>
            <div className="flex-1">
              <p className="font-bold">
                {delivery.rider
                  ? live
                    ? `${delivery.rider.name} is on the way — live GPS`
                    : delivered
                    ? `Delivered by ${delivery.rider.name}`
                    : stage === 1 && !startedAtPickup
                    ? `${delivery.rider.name} is heading to pickup`
                    : `${delivery.rider.name} is ${minsLeft} min away`
                  : "Matching nearest available rider..."}
              </p>
              <p className="text-sm text-white/50">
                {delivery.rider
                  ? `${delivery.rider.vehicle || "Motorbike"} · ${delivery.rider.plate || "WAKA-MAN"} · ★ ${(delivery.rider.rating || 5.0).toFixed(1)}`
                  : "Dispatching order to nearby fleet"}
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
                <p className="font-semibold text-ink">
                  {typeof delivery.pickup === "string" ? delivery.pickup : delivery.pickup?.address}
                </p>
                <p className="text-xs text-ink/45">Pickup</p>
              </div>
              <div>
                <p className="font-semibold text-ink">
                  {typeof delivery.dropoff === "string" ? delivery.dropoff : delivery.dropoff?.address}
                </p>
                <p className="text-xs text-ink/45">Drop-off · {delivery.packageNote || "Package"}</p>
              </div>
            </div>
            <p className="font-bold text-primary">{delivery.fare || "₦1,500"}</p>
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
                Thanks — your {rated}-star rating goes on {delivery.rider?.name ?? "the rider"}&apos;s record.
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
