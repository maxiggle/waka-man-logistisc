// Publish/subscribe layer for live rider positions.
// Hot path: Firebase RTDB at live/{deliveryId} (latest position only — cost guardrail).
// When Firebase env vars are absent, a BroadcastChannel stub links same-origin tabs
// so the whole flow stays demoable locally.

import { ref, set, onValue, remove } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { riderPositionSchema } from "@/lib/schemas";
import type { RiderPosition } from "@/lib/native/rider-location";

/** ≥4s between writes — cost guardrail. */
const PUBLISH_INTERVAL_MS = 4000;
/** Reject jumps implying faster than ~50 m/s (~180 km/h) between fixes. */
const MAX_PLAUSIBLE_SPEED_MPS = 50;

const lastPublishAt = new Map<string, number>();
const lastPosition = new Map<string, RiderPosition>();

function metersBetween(a: RiderPosition, b: RiderPosition): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type PublishResult = "published" | "throttled" | "rejected";

/**
 * Validate and publish a position. Positions are untrusted (they cross the
 * native bridge): schema/range-checked, mock fixes refused, implausible jumps dropped.
 */
export function publishPosition(deliveryId: string, raw: unknown): PublishResult {
  const parsed = riderPositionSchema.safeParse(raw);
  if (!parsed.success) return "rejected";
  const pos = parsed.data as RiderPosition;
  if (pos.isMock) return "rejected";

  const prev = lastPosition.get(deliveryId);
  if (prev) {
    const dt = (pos.timestamp - prev.timestamp) / 1000;
    if (dt <= 0) return "rejected";
    if (metersBetween(prev, pos) / dt > MAX_PLAUSIBLE_SPEED_MPS) return "rejected";
  }

  const now = Date.now();
  const last = lastPublishAt.get(deliveryId) ?? 0;
  if (now - last < PUBLISH_INTERVAL_MS) return "throttled";

  lastPublishAt.set(deliveryId, now);
  lastPosition.set(deliveryId, pos);

  if (rtdb) {
    // Latest-only write; no history kept (cost guardrail).
    void set(ref(rtdb, `live/${deliveryId}`), pos);
  } else {
    channelFor(deliveryId)?.postMessage(pos);
  }
  return "published";
}

/** Remove the live position when a delivery completes. */
export function clearPosition(deliveryId: string): void {
  lastPublishAt.delete(deliveryId);
  lastPosition.delete(deliveryId);
  if (rtdb) void remove(ref(rtdb, `live/${deliveryId}`));
}

/** Subscribe to live positions for a delivery. Returns an unsubscribe fn. */
export function subscribeToPosition(
  deliveryId: string,
  cb: (pos: RiderPosition) => void,
): () => void {
  if (rtdb) {
    return onValue(ref(rtdb, `live/${deliveryId}`), (snap) => {
      const parsed = riderPositionSchema.safeParse(snap.val());
      if (parsed.success) cb(parsed.data as RiderPosition);
    });
  }
  const ch = channelFor(deliveryId);
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    const parsed = riderPositionSchema.safeParse(e.data);
    if (parsed.success) cb(parsed.data as RiderPosition);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

/** True when positions go through Firebase rather than the local stub. */
export function isLiveBackendConfigured(): boolean {
  return rtdb !== null;
}

// --- BroadcastChannel stub (demo without Firebase; same-origin tabs only) ---

const channels = new Map<string, BroadcastChannel>();

function channelFor(deliveryId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null; // SSR / old browser
  let ch = channels.get(deliveryId);
  if (!ch) {
    ch = new BroadcastChannel(`wm-live-${deliveryId}`);
    channels.set(deliveryId, ch);
  }
  return ch;
}
