"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { coordsOf, PAYABLE_DELIVERY_STATUSES, type DeliveryItem, type DeliveryStatus, type LatLng } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";
import { subscribeToPosition } from "@/lib/tracking";
import { hasMapbox } from "@/lib/mapbox";
import { FALLBACK_SERVICE_AREA } from "@/lib/dispatchConfig";
import { getDefaultServiceArea } from "@/lib/serviceAreas";
import type { RiderPosition } from "@/lib/native/rider-location";

// mapbox-gl touches window at import — load it client-side only.
const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

/**
 * Stepper stages, each covering one or more delivery statuses.
 *
 * The mapping is one-to-many because "Requested" spans both `pending` (no
 * offer out yet) and `offered` (out to riders, nobody has accepted). Keying
 * stages directly to statuses meant every status without its own stage fell
 * to index -1 and rendered the whole stepper unlit — so a delivery actively
 * being broadcast to riders looked identical to one where nothing was
 * happening. `cancelled` is deliberately absent: -1 there is correct, since
 * a cancelled delivery has no progress to show.
 */
const STAGES: { key: string; label: string; statuses: DeliveryStatus[] }[] = [
  { key: "requested", label: "Requested", statuses: ["pending", "offered"] },
  { key: "assigned", label: "Confirmed", statuses: ["assigned"] },
  { key: "picked_up", label: "Picked up", statuses: ["picked_up"] },
  { key: "in_transit", label: "In transit", statuses: ["in_transit"] },
  { key: "arrived", label: "Arrived", statuses: ["arrived"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

export default function LiveTracking({ delivery }: { delivery: DeliveryItem }) {
  const [rated, setRated] = useState(0);
  const [livePos, setLivePos] = useState<RiderPosition | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [codeDocExists, setCodeDocExists] = useState(false);
  const [fallbackCenter, setFallbackCenter] = useState<LatLng>(FALLBACK_SERVICE_AREA);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
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
  // to it here is the legitimate read. Since W5-T2 this doc doesn't exist
  // until a payment is verified server-side (src/server/payments.ts), so
  // "missing" and "permission denied" are two different, non-error states
  // that must not render the same way: missing means "not paid yet", denied
  // means this viewer shouldn't be looking at this delivery at all.
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, "deliveries", delivery.id, "private", "code"),
      (snap) => {
        setCodeDocExists(snap.exists());
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

  const isPayable = PAYABLE_DELIVERY_STATUSES.includes(delivery.status) && delivery.paymentStatus !== "paid";

  // Pays for the delivery via Paystack Inline, then triggers the
  // client-side verify shortcut — the confirmation code itself is never
  // learned from this call. It arrives through the onSnapshot above once
  // the server verifies the payment and creates the code doc.
  const handlePay = useCallback(async () => {
    if (!auth?.currentUser) {
      setPayError("Please sign in again to pay.");
      return;
    }
    setPaying(true);
    setPayError("");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const initRes = await fetch(`/api/deliveries/${delivery.id}/payment/initialize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const initData = await initRes.json().catch(() => null);
      if (!initRes.ok) {
        setPayError(initData?.error || "Could not start payment.");
        setPaying(false);
        return;
      }

      const { default: PaystackPop } = await import("@paystack/inline-js");
      const popup = new PaystackPop();
      const verify = () => {
        fetch(`/api/deliveries/${delivery.id}/payment/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ reference: initData.reference }),
        }).catch((err) => console.error("Payment verify failed:", err));
        setPaying(false);
      };
      // resumeTransaction(accessCode), not newTransaction({ amount }) — the
      // amount was fixed server-side at initialize and must stay that way.
      popup.resumeTransaction(initData.accessCode, { onSuccess: verify, onCancel: verify });
    } catch (err) {
      console.error("Payment failed to start:", err);
      setPayError("Something went wrong starting payment.");
      setPaying(false);
    }
  }, [delivery.id]);

  // Stage comes from the delivery's real status — the rider drives these
  // transitions through /api/deliveries/[id]/status. -1 means "pending", i.e.
  // not yet assigned, so nothing on the stepper is lit.
  const stageIndex = STAGES.findIndex((s) => s.statuses.includes(delivery.status));
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
            <p className="font-bold text-primary">{formatQuote(delivery.quotedAmountKobo)}</p>
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
        ) : codeError ? (
          <div className="rounded-3xl bg-white border border-ink/10 p-6">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Confirmation code</p>
            <p className="mt-1 text-sm text-ink/55">You don&apos;t have permission to view this delivery&apos;s code.</p>
          </div>
        ) : !codeDocExists ? (
          // Only once the delivery is actually payable. This card used to
          // render for any unpaid delivery, so a freshly booked one with no
          // rider yet showed "Pay now so your confirmation code is ready"
          // directly above "Payment isn't available for this delivery yet" —
          // inviting and refusing payment two lines apart. Nothing is shown
          // before then: the fare is already on the delivery card above, and
          // there is no action for the customer to take until a rider
          // accepts.
          isPayable && (
            <div className="rounded-3xl bg-white border border-ink/10 p-6">
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Payment</p>
              <p className="mt-1 text-sm text-ink/55 max-w-[34ch]">
                {delivery.status === "arrived"
                  ? "The rider is waiting — pay now to get your confirmation code."
                  : "Pay now so your confirmation code is ready when the rider arrives."}
              </p>
              {payError && <p className="mt-3 text-sm text-red-600">{payError}</p>}
              <button
                type="button"
                onClick={handlePay}
                disabled={paying}
                className="mt-4 w-full rounded-full bg-accent text-ink font-semibold px-6 py-3.5 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-60"
              >
                {paying ? "Opening payment…" : `Pay ${formatQuote(delivery.quotedAmountKobo)}`}
              </button>
            </div>
          )
        ) : (
          <div className="rounded-3xl bg-white border border-ink/10 p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Confirmation code</p>
              <p className="mt-1 text-sm text-ink/55 max-w-[26ch]">
                Give this to the rider at the door to confirm delivery.
              </p>
            </div>
            <p className="font-display text-3xl font-extrabold tracking-[0.2em] text-primary tabular-nums">{code ?? "····"}</p>
          </div>
        )}

        <Link href="/track" className="text-center text-sm font-semibold text-ink/50 hover:text-primary transition-colors">
          Track another delivery
        </Link>
      </div>
    </div>
  );
}
