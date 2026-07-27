"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { createLocationTracker, type LocationTracker, type RiderPosition } from "@/lib/location";
import { publishPosition, clearPosition, isLiveBackendConfigured } from "@/lib/tracking";
import { publishRiderAvailability, clearRiderAvailability } from "@/lib/riderAvailability";
import { matchNearestDelivery } from "@/lib/dispatch";
import { AVAILABILITY_PUBLISH_INTERVAL_MS } from "@/lib/dispatchConfig";

/** Label passed to the native tracker while browsing for jobs (no delivery yet). */
const IDLE_TRACKING_LABEL = "idle-availability";

type Mode = "checking" | "offline" | "searching" | "assigned";

function RiderActive() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>(() => (isFirebaseConfigured ? "checking" : "offline"));
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<"idle" | "starting" | "tracking" | "denied">("idle");
  const [lastFix, setLastFix] = useState<RiderPosition | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<number | null>(null);
  const [mockWarning, setMockWarning] = useState(false);
  const [error, setError] = useState("");

  const trackerRef = useRef<LocationTracker | null>(null);
  const lastAvailabilityPublishAt = useRef(0);
  const swept = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login?redirect=/rider/active");
  }, [authLoading, user, router]);

  // Detect an active assignment (claimed by matching, or by an admin) in
  // real time — this is what moves a rider from "searching" to "assigned"
  // without them having to do anything.
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !db) return;
    const q = query(
      collection(db, "deliveries"),
      where("riderId", "==", user.uid),
      where("status", "in", ["assigned", "picked_up", "in_transit", "arrived"]),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setDeliveryId(snap.docs[0].id);
          setMode("assigned");
        } else {
          setDeliveryId((prev) => (prev ? null : prev));
          setMode((prev) => (prev === "assigned" ? "offline" : prev === "checking" ? "offline" : prev));
        }
      },
      (err) => console.error("Failed to watch for assigned deliveries:", err),
    );
    return () => unsub();
  }, [user, authLoading]);

  const stopTracker = useCallback(async () => {
    await trackerRef.current?.stop();
    trackerRef.current = null;
    setTrackingStatus("idle");
  }, []);

  // Idle GPS loop while "searching": publishes availability so other clients'
  // matching can find this rider, and sweeps once for any job that was
  // already waiting when we came online.
  const goOnline = useCallback(async () => {
    if (!user) return;
    setError("");
    setTrackingStatus("starting");
    swept.current = false;

    const tracker = createLocationTracker();
    trackerRef.current = tracker;
    const ok = await tracker.start(IDLE_TRACKING_LABEL, (pos) => {
      setLastFix(pos);
      if (pos.isMock) return; // never publish mock fixes as real availability

      const now = Date.now();
      if (now - lastAvailabilityPublishAt.current < AVAILABILITY_PUBLISH_INTERVAL_MS) return;
      lastAvailabilityPublishAt.current = now;

      publishRiderAvailability(
        user.uid,
        userProfile?.name || user.displayName || "Rider",
        { lat: pos.lat, lng: pos.lng },
        "online",
      )
        .then(() => {
          if (swept.current) return;
          swept.current = true;
          return matchNearestDelivery({
            id: user.uid,
            name: userProfile?.name || user.displayName || "Rider",
            lat: pos.lat,
            lng: pos.lng,
          });
        })
        .catch((err) => console.error("Failed to publish rider availability:", err));
    });

    setTrackingStatus(ok ? "tracking" : "denied");
    setMode(ok ? "searching" : "offline");
  }, [user, userProfile]);

  const goOffline = useCallback(async () => {
    await stopTracker();
    if (user) await clearRiderAvailability(user.uid).catch(() => {});
    setMode("offline");
  }, [stopTracker, user]);

  // Once assigned, switch the same tracker over to publishing on the
  // delivery's live channel instead of the idle-availability one.
  useEffect(() => {
    if (mode !== "assigned" || !deliveryId) return;
    let cancelled = false;

    (async () => {
      await trackerRef.current?.stop();
      if (cancelled) return;
      setTrackingStatus("starting");
      const tracker = createLocationTracker();
      trackerRef.current = tracker;
      const ok = await tracker.start(deliveryId, (pos) => {
        setLastFix(pos);
        if (pos.isMock) setMockWarning(true);
        if (publishPosition(deliveryId, pos) === "published") {
          setLastPublishedAt(Date.now());
        }
      });
      if (!cancelled) setTrackingStatus(ok ? "tracking" : "denied");
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, deliveryId]);

  // When a delivery finishes and we drop back out of "assigned", clear its
  // live position and stop the tracker — goOnline() is a fresh user action.
  const prevMode = useRef<Mode>(mode);
  useEffect(() => {
    if (prevMode.current === "assigned" && mode !== "assigned") {
      void stopTracker();
      if (deliveryId) clearPosition(deliveryId);
      setMockWarning(false);
    }
    prevMode.current = mode;
  }, [mode, deliveryId, stopTracker]);

  useEffect(() => {
    return () => {
      void trackerRef.current?.stop();
      if (user) void clearRiderAvailability(user.uid).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading || !user || mode === "checking") {
    return (
      <main className="min-h-screen bg-surface-deep flex items-center justify-center">
        <p className="text-sm text-ink/40 animate-pulse">Checking your session…</p>
      </main>
    );
  }

  if (userProfile && userProfile.role !== "rider") {
    return (
      <main className="min-h-screen bg-surface-deep flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-semibold text-ink">This page is for riders.</p>
          <Link href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-primary hover:text-primary-soft">
            Go to your dashboard →
          </Link>
        </div>
      </main>
    );
  }

  const tracking = trackingStatus === "tracking";

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
        {mode === "offline" && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">You&apos;re offline</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Go online to get jobs</h1>
            <p className="mt-2 text-sm text-ink/60">
              We&apos;ll match you to the nearest waiting delivery automatically once you&apos;re online.
            </p>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={goOnline}
              disabled={trackingStatus === "starting"}
              className="mt-8 w-full rounded-full bg-primary text-white font-semibold px-6 py-3.5 hover:bg-primary-soft transition-colors cursor-pointer disabled:opacity-60"
            >
              {trackingStatus === "starting" ? "Starting…" : "Go online"}
            </button>
            {trackingStatus === "denied" && (
              <p className="mt-3 text-xs text-ink/50">
                Location permission denied. Enable location for Waka Man in your device settings, then try again.
              </p>
            )}
          </>
        )}

        {mode === "searching" && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Online</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Looking for a job…</h1>
            <p className="mt-2 text-sm text-ink/60">
              Your location is being shared so nearby delivery requests can find you.
            </p>
            <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink/70">Status</span>
                <span className="flex items-center gap-2 text-sm font-bold text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  Searching
                </span>
              </div>
              {lastFix && (
                <p className="text-xs text-ink/45 tabular-nums">
                  {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)} · ±{Math.round(lastFix.accuracy)}m
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={goOffline}
              className="mt-6 w-full rounded-full bg-ink text-white font-semibold px-6 py-3.5 hover:bg-ink/80 transition-colors cursor-pointer"
            >
              Go offline
            </button>
          </>
        )}

        {mode === "assigned" && deliveryId && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Active delivery</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Share your location</h1>
            <p className="mt-2 text-sm text-ink/60">
              Your position is shared with the sender and recipient only while this delivery is active.
            </p>

            <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-6 space-y-5">
              <div className="rounded-xl bg-surface-deep px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink/70">Delivery</span>
                <span className="font-mono text-xs font-bold text-ink/50">{deliveryId.slice(0, 10)}</span>
              </div>

              <div className="rounded-xl bg-surface-deep px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink/70">Status</span>
                <span className="flex items-center gap-2 text-sm font-bold">
                  {tracking ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                      <span className="text-accent">Broadcasting</span>
                    </>
                  ) : trackingStatus === "starting" ? (
                    <span className="text-ink/50">Requesting permission…</span>
                  ) : trackingStatus === "denied" ? (
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
            </div>

            <Link
              href={`/track/${deliveryId}`}
              className="mt-6 block text-center text-sm font-semibold text-ink/50 hover:text-primary transition-colors"
            >
              View the tracking page for this delivery
            </Link>
          </>
        )}
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
