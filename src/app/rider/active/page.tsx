"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createLocationTracker, type LocationTracker, type RiderPosition } from "@/lib/location";
import { publishPosition, clearPosition, isLiveBackendConfigured } from "@/lib/tracking";
import { deliveries } from "@/lib/demo";

type Status = "idle" | "starting" | "tracking" | "denied";

function RiderActive() {
  const params = useSearchParams();
  const [deliveryId, setDeliveryId] = useState(params.get("delivery") ?? deliveries[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [lastFix, setLastFix] = useState<RiderPosition | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<number | null>(null);
  const [mockWarning, setMockWarning] = useState(false);
  const trackerRef = useRef<LocationTracker | null>(null);

  useEffect(() => {
    return () => {
      void trackerRef.current?.stop();
    };
  }, []);

  async function start() {
    setStatus("starting");
    setMockWarning(false);
    const tracker = createLocationTracker();
    trackerRef.current = tracker;
    const ok = await tracker.start(deliveryId, (pos) => {
      setLastFix(pos);
      if (pos.isMock) setMockWarning(true);
      if (publishPosition(deliveryId, pos) === "published") {
        setLastPublishedAt(Date.now());
      }
    });
    setStatus(ok ? "tracking" : "denied");
  }

  async function stop() {
    await trackerRef.current?.stop();
    trackerRef.current = null;
    clearPosition(deliveryId);
    setStatus("idle");
  }

  const tracking = status === "tracking";

  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <span className="text-sm font-semibold text-ink/50">Rider mode</span>
        </nav>
      </header>

      <div className="mx-auto max-w-md px-6 py-12">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Active delivery</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Share your location</h1>
        <p className="mt-2 text-sm text-ink/60">
          Your position is shared with the sender and recipient only while a delivery is active.
        </p>

        <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-6 space-y-5">
          <label className="block">
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Delivery</span>
            <select
              value={deliveryId}
              onChange={(e) => setDeliveryId(e.target.value)}
              disabled={tracking || status === "starting"}
              className="mt-2 w-full rounded-xl border border-ink/15 bg-surface px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {deliveries.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} — {d.dropoff}
                </option>
              ))}
              {!deliveries.some((d) => d.id === deliveryId) && (
                <option value={deliveryId}>{deliveryId}</option>
              )}
            </select>
          </label>

          <div className="rounded-xl bg-surface-deep px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink/70">Status</span>
            <span className="flex items-center gap-2 text-sm font-bold">
              {tracking ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-accent">Broadcasting</span>
                </>
              ) : status === "starting" ? (
                <span className="text-ink/50">Requesting permission…</span>
              ) : status === "denied" ? (
                <span className="text-red-600">Location permission denied</span>
              ) : (
                <span className="text-ink/50">Off</span>
              )}
            </span>
          </div>

          {lastFix && (
            <div className="rounded-xl bg-surface-deep px-4 py-3 text-sm text-ink/70 space-y-1">
              <p className="tabular-nums">
                {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)} · ±{Math.round(lastFix.accuracy)}m
              </p>
              <p className="text-xs text-ink/45">
                {lastPublishedAt
                  ? `Last shared ${new Date(lastPublishedAt).toLocaleTimeString()}`
                  : "Not shared yet"}
                {" · "}
                {isLiveBackendConfigured() ? "via Firebase" : "local demo relay"}
              </p>
            </div>
          )}

          {mockWarning && (
            <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3">
              A mock-location app was detected on this device. These positions are not shared.
            </p>
          )}

          {status === "denied" && (
            <p className="text-xs text-ink/50">
              Enable location for Waka Man in your device settings, then try again. For background
              tracking on Android choose &ldquo;Allow all the time&rdquo;.
            </p>
          )}

          {tracking ? (
            <button
              type="button"
              onClick={stop}
              className="w-full rounded-full bg-ink text-white font-semibold px-6 py-3.5 hover:bg-ink/80 transition-colors cursor-pointer"
            >
              Stop sharing
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={status === "starting"}
              className="w-full rounded-full bg-primary text-white font-semibold px-6 py-3.5 hover:bg-primary-soft transition-colors cursor-pointer disabled:opacity-60"
            >
              {status === "starting" ? "Starting…" : "Start sharing location"}
            </button>
          )}
        </div>

        <Link
          href={`/track/${deliveryId}`}
          className="mt-6 block text-center text-sm font-semibold text-ink/50 hover:text-primary transition-colors"
        >
          View the tracking page for {deliveryId}
        </Link>
      </div>
    </main>
  );
}

export default function RiderActivePage() {
  return (
    <Suspense fallback={null}>
      <RiderActive />
    </Suspense>
  );
}
