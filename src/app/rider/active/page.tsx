"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { createLocationTracker, type LocationTracker, type RiderPosition } from "@/lib/location";
import { publishPosition, clearPosition, isLiveBackendConfigured } from "@/lib/tracking";
import { publishRiderAvailability, clearRiderAvailability } from "@/lib/riderAvailability";
import { matchNearestDelivery } from "@/lib/dispatch";
import { AVAILABILITY_PUBLISH_INTERVAL_MS, AVAILABILITY_TTL_MS } from "@/lib/dispatchConfig";
import { advanceDeliveryStatus, completeDelivery, type NonTerminalStatus } from "@/lib/deliveryLifecycle";
import { acceptDeliveryOffer, rejectDeliveryOffer } from "@/lib/deliveryOffers";
import type { DeliveryItem, DeliveryStatus } from "@/lib/schemas";
import { formatQuote } from "@/lib/money";

/** Label passed to the native tracker while browsing for jobs (no delivery yet). */
const IDLE_TRACKING_LABEL = "idle-availability";

type Mode = "checking" | "offline" | "searching" | "assigned";

type DeliveryOffer = {
  id: string;
  pickup: string;
  dropoff: string;
  quotedAmountKobo?: number;
  vehicle?: string;
  offeredAt: number;
  offerExpiresAt: number;
};

function RiderActive() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>(() => (isFirebaseConfigured ? "checking" : "offline"));
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<DeliveryItem["paymentStatus"]>(undefined);
  const [trackingStatus, setTrackingStatus] = useState<"idle" | "starting" | "tracking" | "denied">("idle");
  const [lastFix, setLastFix] = useState<RiderPosition | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<number | null>(null);
  const [mockWarning, setMockWarning] = useState(false);
  const [error, setError] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [offers, setOffers] = useState<DeliveryOffer[]>([]);
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);
  const [offerMessages, setOfferMessages] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [restoredOnline, setRestoredOnline] = useState(false);

  const trackerRef = useRef<LocationTracker | null>(null);
  const lastAvailabilityPublishAt = useRef(0);
  const swept = useRef(false);
  const restoreCheckedRef = useRef(false);
  // Holds the rider's display name for the idle-tracking effect below without
  // making that effect depend on userProfile — depending on it directly would
  // restart the GPS tracker (and its permission prompt) on every profile
  // refresh.
  const displayNameRef = useRef<string>("Rider");
  useEffect(() => {
    displayNameRef.current = userProfile?.name || user?.displayName || "Rider";
  }, [userProfile, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login?redirect=/rider/active");
  }, [authLoading, user, router]);

  // A lifecycle error from a status transition shouldn't linger once the
  // delivery has actually moved past it — otherwise a stale rejection stays
  // on screen through subsequent, successful transitions.
  useEffect(() => {
    const timer = setTimeout(() => setLifecycleError(""), 0);
    return () => clearTimeout(timer);
  }, [deliveryStatus]);

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
          const data = snap.docs[0].data();
          setDeliveryId(snap.docs[0].id);
          setDeliveryStatus((data.status as DeliveryStatus) ?? null);
          setPaymentStatus(data.paymentStatus as DeliveryItem["paymentStatus"]);
          setMode("assigned");
        } else {
          setDeliveryId((prev) => (prev ? null : prev));
          setDeliveryStatus(null);
          setPaymentStatus(undefined);
          // A finished or released delivery returns the rider to searching, not offline —
          // going online is an explicit choice that stays in force until they toggle it
          // off. The server already keeps their availability "online" through completion
          // (src/server/deliveryLifecycle.ts); dropping to "offline" here silently undid
          // that and left them stale within AVAILABILITY_TTL_MS.
          // "checking" -> "offline" is unchanged: that is first load with no active
          // delivery, where the rider has not gone online yet.
          setMode((prev) => (prev === "assigned" ? "searching" : prev === "checking" ? "offline" : prev));
        }
      },
      (err) => console.error("Failed to watch for assigned deliveries:", err),
    );
    return () => unsub();
  }, [user, authLoading]);

  // Startup reconciliation: presence is durable now (see the unmount effect
  // below and W4-T3), so on a fresh load — app reopened, or this page
  // revisited after being killed — React state resets to "offline" while the
  // riderAvailability document may still be there and still fresh. Without
  // this the rider sees "Offline" while still being offered deliveries.
  // Read once, directly; this is a one-time reconciliation, not live state —
  // the idle-tracking effect below takes over publishing once mode flips to
  // "searching".
  useEffect(() => {
    if (authLoading || !user || !isFirebaseConfigured || !db || restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    const database = db;

    (async () => {
      try {
        const snap = await getDoc(doc(database, "riderAvailability", user.uid));
        if (!snap.exists()) return;
        const updatedAt = snap.data().updatedAt;
        if (typeof updatedAt !== "number" || Date.now() - updatedAt > AVAILABILITY_TTL_MS) return;

        // A currently active delivery still wins — this only restores the
        // "was online" session, never overrides "assigned".
        swept.current = false;
        setRestoredOnline(true);
        setMode((prev) => (prev === "assigned" ? prev : "searching"));
      } catch (err) {
        console.error("Failed to restore rider presence on load:", err);
      }
    })();
  }, [authLoading, user]);

  // Live broadcast offers held by this rider. Separate from the query above:
  // an offer is never assigned (riderId stays unset until accepted), so it
  // would never appear in the riderId == uid query — this is the only way
  // the rider finds out about it.
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !db) return;
    const q = query(
      collection(db, "deliveries"),
      where("status", "==", "offered"),
      where("offeredTo", "array-contains", user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeliveryOffer[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            pickup: typeof data.pickup === "string" ? data.pickup : data.pickup?.address || "Pickup address",
            dropoff: typeof data.dropoff === "string" ? data.dropoff : data.dropoff?.address || "Drop-off address",
            // The server-frozen quote, not a string the customer wrote —
            // this is the number the rider decides to accept the job on.
            quotedAmountKobo: typeof data.quotedAmountKobo === "number" ? data.quotedAmountKobo : undefined,
            vehicle: typeof data.vehicle === "string" ? data.vehicle : undefined,
            offeredAt: typeof data.offeredAt === "number" ? data.offeredAt : 0,
            offerExpiresAt: typeof data.offerExpiresAt === "number" ? data.offerExpiresAt : 0,
          };
        });
        list.sort((a, b) => b.offeredAt - a.offeredAt);
        setOffers(list);
      },
      (err) => console.error("Failed to watch delivery offers:", err),
    );
    return () => unsub();
  }, [user]);

  // Ticks once a second while any offer is live, purely to redraw the
  // countdown and drop cards locally the instant they hit zero — showing an
  // Accept button that is guaranteed to 409 is worse than showing nothing.
  useEffect(() => {
    if (offers.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [offers.length]);

  const liveOffers = offers.filter((o) => o.offerExpiresAt > now);

  const handleAcceptOffer = useCallback(async (offerId: string) => {
    setOfferBusyId(offerId);
    setOfferMessages((m) => ({ ...m, [offerId]: "" }));
    const result = await acceptDeliveryOffer(offerId);
    setOfferBusyId(null);
    if (!result.ok) {
      // Losing a race is the expected outcome for most recipients of a
      // broadcast offer — this must read as ordinary, not as a fault.
      setOfferMessages((m) => ({ ...m, [offerId]: result.error }));
      return;
    }
    // On success the assigned-delivery subscription above picks this up on
    // its own and switches mode to "assigned" — nothing to do here.
  }, []);

  const handleRejectOffer = useCallback(async (offerId: string) => {
    setOfferBusyId(offerId);
    const result = await rejectDeliveryOffer(offerId);
    setOfferBusyId(null);
    if (!result.ok) setOfferMessages((m) => ({ ...m, [offerId]: result.error }));
    // On success the offers subscription above naturally drops this card
    // (this uid leaves offeredTo) — nothing to do here.
  }, []);

  const stopTracker = useCallback(async () => {
    await trackerRef.current?.stop();
    trackerRef.current = null;
    setTrackingStatus("idle");
  }, []);

  // Idle GPS loop while "searching": publishes availability so other clients'
  // matching can find this rider, and sweeps once for any job that was
  // already waiting. Mode-driven, mirroring the assigned-delivery tracker
  // effect below, so re-entering "searching" after finishing or releasing a
  // job (see the assignment-detection effect above) restarts publishing on
  // its own — the rider does not have to tap "Go online" again.
  useEffect(() => {
    if (mode !== "searching" || !user) return;
    let cancelled = false;
    const uid = user.uid;

    (async () => {
      await trackerRef.current?.stop();
      if (cancelled) return;
      setTrackingStatus("starting");

      try {
        const tracker = createLocationTracker();
        trackerRef.current = tracker;
        const ok = await tracker.start(IDLE_TRACKING_LABEL, (pos) => {
          setLastFix(pos);
          if (pos.isMock) return; // never publish mock fixes as real availability

          const now = Date.now();
          if (now - lastAvailabilityPublishAt.current < AVAILABILITY_PUBLISH_INTERVAL_MS) return;
          lastAvailabilityPublishAt.current = now;

          publishRiderAvailability(
            uid,
            displayNameRef.current,
            { lat: pos.lat, lng: pos.lng },
            "online",
          )
            .then(() => {
              // Publish succeeded — the rider is genuinely visible to
              // dispatch now, independent of whether the sweep below finds
              // them a job. No args: the server derives who's asking from
              // the bearer token and reads position from the rider's own
              // availability document — see src/server/dispatch.ts.
              if (swept.current) return;
              matchNearestDelivery()
                .then(() => {
                  swept.current = true;
                })
                .catch((err) => {
                  // A failed sweep (rate-limited, transient network) must not
                  // mark `swept` — leave it false so the next position tick
                  // retries. Publishing already succeeded, so the rider IS
                  // online; this isn't worth kicking them offline over, and
                  // a client's own booking will still reach them either way.
                  console.error("Rider sweep-match failed (will retry next tick):", err);
                });
            })
            .catch((err) => {
              // The UI must not keep saying "Searching" when the rider isn't
              // actually visible to dispatch — surface the failure and drop
              // them back out of searching rather than leaving a false
              // impression that they're online.
              console.error("Failed to publish rider availability:", err);
              setError("You're not visible to dispatch right now — check your connection and go online again.");
              setMode("offline");
              void stopTracker();
            });
        });

        if (cancelled) return;
        setTrackingStatus(ok ? "tracking" : "denied");
        if (!ok) setMode("offline");
      } catch (err) {
        console.error("Failed to start location tracker:", err);
        if (cancelled) return;
        setError("Couldn't start location tracking. Check permissions and try again.");
        setTrackingStatus("idle");
        setMode("offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, user, stopTracker]);

  const goOnline = useCallback(() => {
    if (!user) return;
    setError("");
    setRestoredOnline(false);
    swept.current = false;
    setMode("searching");
  }, [user]);

  const goOffline = useCallback(async () => {
    await stopTracker();
    if (user) await clearRiderAvailability(user.uid).catch(() => {});
    setRestoredOnline(false);
    setMode("offline");
  }, [stopTracker, user]);

  // Handles both forward advances (picked_up/in_transit/arrived) and the
  // pre-pickup release back to "pending" — both are non-terminal from the
  // delivery's perspective (matchable again), just different directions.
  const handleAdvance = useCallback(
    async (status: NonTerminalStatus | "pending") => {
      if (!deliveryId) return;
      setLifecycleBusy(true);
      setLifecycleError("");
      const result = await advanceDeliveryStatus(deliveryId, status);
      setLifecycleBusy(false);
      if (!result.ok) setLifecycleError(result.error);
      // On success the status-in-filter query above naturally reflects the
      // new state (including returning to "searching" for a release) —
      // no manual reset needed here.
    },
    [deliveryId],
  );

  const handleComplete = useCallback(async () => {
    if (!deliveryId) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    const result = await completeDelivery(deliveryId, codeInput);
    setLifecycleBusy(false);
    if (!result.ok) {
      setLifecycleError(result.error);
      return;
    }
    setCodeInput("");
  }, [deliveryId, codeInput]);

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
  // live position and mark the rider unswept so they sweep for waiting work
  // again — going online stays in force, so the idle tracker (above) picks
  // back up on its own when mode returns to "searching". The tracker itself
  // is deliberately left running: tearing it down here would recreate the
  // exact staleness window this behaviour exists to close.
  const prevMode = useRef<Mode>(mode);
  useEffect(() => {
    if (prevMode.current === "assigned" && mode !== "assigned") {
      if (deliveryId) clearPosition(deliveryId);
      setMockWarning(false);
      swept.current = false;
    }
    prevMode.current = mode;
  }, [mode, deliveryId]);

  // Presence is durable — navigating away, or the app closing outright, must
  // not end it. Only the explicit toggle (goOffline) or the server-side
  // sweep (AVAILABILITY_TTL_MS) does that. The tracker still stops with the
  // component; it just no longer takes the rider offline on the way out.
  useEffect(() => {
    return () => {
      void trackerRef.current?.stop();
    };
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
            {restoredOnline && (
              <p className="mt-3 rounded-xl bg-primary/10 text-primary text-xs font-semibold px-3 py-2">
                You&apos;re still online from before — we kept you visible to dispatch.
              </p>
            )}

            {liveOffers.length > 0 && (
              <div className="mt-6 space-y-4">
                {liveOffers.map((offer) => {
                  const secondsLeft = Math.max(0, Math.ceil((offer.offerExpiresAt - now) / 1000));
                  const busy = offerBusyId === offer.id;
                  const message = offerMessages[offer.id];
                  return (
                    <div key={offer.id} className="rounded-2xl bg-white border border-accent/40 p-5 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-accent">New delivery offer</span>
                        <span className="text-xs font-bold text-ink/50 tabular-nums">{secondsLeft}s</span>
                      </div>
                      <div className="text-sm text-ink/80 space-y-1">
                        <p><span className="font-semibold">Pickup:</span> {offer.pickup}</p>
                        <p><span className="font-semibold">Drop-off:</span> {offer.dropoff}</p>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-ink/50 uppercase tracking-wide text-xs">
                          {offer.vehicle || "Standard"}
                        </span>
                        <span className="font-bold text-primary">{formatQuote(offer.quotedAmountKobo)}</span>
                      </div>
                      {message && <p className="text-xs text-ink/50">{message}</p>}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleRejectOffer(offer.id)}
                          disabled={busy}
                          className="flex-1 rounded-full border border-ink/15 text-ink/70 font-semibold px-4 py-2.5 hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptOffer(offer.id)}
                          disabled={busy}
                          className="flex-1 rounded-full bg-accent text-ink font-semibold px-4 py-2.5 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {busy ? "…" : "Accept"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
                    {isLiveBackendConfigured() ? (
                      "via Firebase"
                    ) : (
                      <span className="text-red-600 font-semibold">live backend not configured</span>
                    )}
                  </p>
                </div>
              )}

              {mockWarning && (
                <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3">
                  A mock-location app was detected on this device. These positions are not shared.
                </p>
              )}
            </div>

            <div className="mt-6 rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
              <p className="text-sm font-semibold text-ink/70">Delivery progress</p>

              {lifecycleError && (
                <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3">
                  {lifecycleError}
                </p>
              )}

              {deliveryStatus === "assigned" && (
                <button
                  type="button"
                  onClick={() => handleAdvance("picked_up")}
                  disabled={lifecycleBusy}
                  className="w-full rounded-full bg-primary text-white font-semibold px-6 py-3.5 hover:bg-primary-soft transition-colors cursor-pointer disabled:opacity-60"
                >
                  {lifecycleBusy ? "Updating…" : "Mark picked up"}
                </button>
              )}

              {deliveryStatus === "picked_up" && (
                <button
                  type="button"
                  onClick={() => handleAdvance("in_transit")}
                  disabled={lifecycleBusy}
                  className="w-full rounded-full bg-primary text-white font-semibold px-6 py-3.5 hover:bg-primary-soft transition-colors cursor-pointer disabled:opacity-60"
                >
                  {lifecycleBusy ? "Updating…" : "Start delivery"}
                </button>
              )}

              {deliveryStatus === "in_transit" && (
                <button
                  type="button"
                  onClick={() => handleAdvance("arrived")}
                  disabled={lifecycleBusy}
                  className="w-full rounded-full bg-primary text-white font-semibold px-6 py-3.5 hover:bg-primary-soft transition-colors cursor-pointer disabled:opacity-60"
                >
                  {lifecycleBusy ? "Updating…" : "Mark arrived"}
                </button>
              )}

              {deliveryStatus === "arrived" && paymentStatus !== "paid" && (
                <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold px-4 py-3 text-center">
                  Awaiting payment — do not release the package.
                </p>
              )}

              {deliveryStatus === "arrived" && paymentStatus === "paid" && (
                <div className="space-y-3">
                  <p className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-3 text-center">
                    Paid — ask for the 4-digit code.
                  </p>
                  <div>
                    <label htmlFor="deliveryCode" className="text-xs font-semibold text-ink/60">
                      Recipient&apos;s 4-digit code
                    </label>
                    <input
                      id="deliveryCode"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      placeholder="0000"
                      className="mt-1.5 w-full rounded-xl border border-ink/15 px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[0.3em] tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={lifecycleBusy || codeInput.length !== 4}
                    className="w-full rounded-full bg-accent text-ink font-semibold px-6 py-3.5 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {lifecycleBusy ? "Confirming…" : "Confirm delivery"}
                  </button>
                </div>
              )}

              {deliveryStatus === "assigned" && (
                <button
                  type="button"
                  onClick={() => handleAdvance("pending")}
                  disabled={lifecycleBusy}
                  className="w-full rounded-full border border-red-200 text-red-600 font-semibold px-6 py-3 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-60"
                >
                  Release delivery
                </button>
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
