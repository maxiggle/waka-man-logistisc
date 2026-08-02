"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { coordsOf, type DeliveryItem, type LatLng } from "@/lib/schemas";
import { subscribeToPosition } from "@/lib/tracking";
import { hasMapbox } from "@/lib/mapbox";
import { FALLBACK_SERVICE_AREA } from "@/lib/dispatchConfig";
import { getDefaultServiceArea } from "@/lib/serviceAreas";
import type { RiderPosition } from "@/lib/native/rider-location";

// mapbox-gl touches window at import — load it client-side only.
const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

const STAGES = [
  { key: "assigned", label: "Confirmed" },
  { key: "picked_up", label: "Picked up" },
  { key: "in_transit", label: "In transit" },
  { key: "arrived", label: "Arrived" },
  { key: "delivered", label: "Delivered" },
] as const;

export default function LiveTracking({ delivery }: { delivery: DeliveryItem }) {
  const [rated, setRated] = useState(0);
  const [livePos, setLivePos] = useState<RiderPosition | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [fallbackCenter, setFallbackCenter] = useState<LatLng>(FALLBACK_SERVICE_AREA);
  const live = livePos !== null;

  // Real rider positions, when a rider is broadcasting for this delivery.
  useEffect(() => {
    return subscribeToPosition(delivery.id, setLivePos);
  }, [delivery.id]);

  // The admin-managed default service area, resolved once — until it
  // resolves (or if it can't), the map falls back to FALLBACK_SERVICE_AREA.
  useEffect(() => {
    let cancelled = false;
    getDefaultServiceArea().then((area) => {
      if (!cancelled) setFallbackCenter(area);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The confirmation code lives outside the top-level delivery document
  // (deliveries/{id}/private/code) so the assigned rider's own query never
  // receives it — this is the client/recipient's own view, so subscribing
  // to it here is the legitimate read. An error callback matters here more
  // than most onSnapshot calls in this app: once rules restrict this path
  // to the owning client, anyone else hitting this page gets a permission
  // error that would otherwise be an unhandled console error with the UI
  // silently stuck on placeholder dots forever.
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, "deliveries", delivery.id, "private", "code"),
      (snap) => {
        const value = snap.data()?.code;
        setCode(typeof value === "string" ? value : null);
        setCodeError(false);
      },
      (err) => {
        console.error("Failed to read delivery confirmation code:", err);
        setCodeError(true);
      },
    );
  }, [delivery.id]);

  // Stage comes from the delivery's real status — the rider drives these
  // transitions through /api/deliveries/[id]/status. -1 means "pending", i.e.
  // not yet assigned, so nothing on the stepper is lit.
  const stageIndex = STAGES.findIndex((s) => s.key === delivery.status);
  const delivered = delivery.status === "delivered";
  const pickupCoords = coordsOf(delivery.pickup);
  const dropoffCoords = coordsOf(delivery.dropoff);
  // The map is worth showing as soon as we know *any* real point — the
  // rider's live fix, or just the pickup/dropoff pair from the booking.
  const showMap = hasMapbox() && (live || pickupCoords !== null || dropoffCoords !== null);

  return (
    <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6">
      {/* Map */}
      <div className="relative rounded-3xl overflow-hidden bg-[#1a1626] min-h-[420px] lg:min-h-[560px]">
        {showMap ? (
          <LiveMap position={livePos} pickup={pickupCoords} dropoff={dropoffCoords} fallbackCenter={fallbackCenter} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <p className="text-sm text-white/45">
              {delivered
                ? "Delivery complete."
                : !hasMapbox()
                ? "Map unavailable — no Mapbox token configured."
                : delivery.rider
                ? "Waiting for the rider's live location…"
                : "Matching nearest available rider…"}
            </p>
          </div>
        )}
        <div className="absolute top-4 left-4 z-10 rounded-full bg-black/40 backdrop-blur px-4 py-1.5 text-xs font-semibold text-white/90">
          {live ? "Live GPS" : delivered ? "Route completed" : "Not yet live"}
          {(live || !delivered) && (
            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
          )}
        </div>
        {live && (
          <p className="absolute bottom-3 right-4 z-10 text-[10px] text-white/40 tabular-nums">
            {livePos.lat.toFixed(5)}, {livePos.lng.toFixed(5)} · updated{" "}
            {new Date(livePos.timestamp).toLocaleTimeString()}
          </p>
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
                    : delivery.status === "arrived"
                    ? `${delivery.rider.name} has arrived`
                    : delivery.status === "in_transit"
                    ? `${delivery.rider.name} is on the way`
                    : `${delivery.rider.name} is heading to pickup`
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
                {i > 0 && <div className={`h-0.5 flex-1 ${i <= stageIndex ? "bg-accent" : "bg-white/15"}`} />}
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${i <= stageIndex ? "bg-accent" : "bg-white/15"}`} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-white/40">
            {STAGES.map((s, i) => (
              <span key={s.key} className={i === stageIndex ? "text-accent font-bold" : ""}>{s.label}</span>
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
              {codeError ? "Confirmed" : `Confirmed with code ${code ?? "····"}`}
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
              <p className="mt-1 text-sm text-ink/55 max-w-[26ch]">
                {codeError
                  ? "You don't have permission to view this delivery's code."
                  : "Give this to the rider at the door to confirm delivery."}
              </p>
            </div>
            {!codeError && (
              <p className="font-display text-3xl font-extrabold tracking-[0.2em] text-primary tabular-nums">{code ?? "····"}</p>
            )}
          </div>
        )}

        <Link href="/track" className="text-center text-sm font-semibold text-ink/50 hover:text-primary transition-colors">
          Track another delivery
        </Link>
      </div>
    </div>
  );
}
