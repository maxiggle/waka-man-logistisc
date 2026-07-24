// One tracker interface over two sources: the native RiderLocation plugin when
// running inside the Capacitor shell, navigator.geolocation on plain web.
// Web fallback is dev/testing only — browsers suspend it in the background.

import { Capacitor } from "@capacitor/core";
import {
  RiderLocation,
  type RiderPosition,
} from "@/lib/native/rider-location";

export type { RiderPosition };

export type LocationTracker = {
  /** Resolves true when permission is granted and tracking has started. */
  start(deliveryId: string, onPosition: (pos: RiderPosition) => void): Promise<boolean>;
  stop(): Promise<void>;
  readonly source: "native" | "web";
};

function createNativeTracker(): LocationTracker {
  let listener: { remove: () => Promise<void> } | null = null;
  return {
    source: "native",
    async start(deliveryId, onPosition) {
      const perms = await RiderLocation.checkPermissions();
      if (perms.location !== "granted") {
        const req = await RiderLocation.requestPermissions();
        if (req.location !== "granted") return false;
      }
      // Background permission is requested separately — Android 11+ auto-denies
      // a combined fine+background request.
      const { background } = await RiderLocation.checkPermissions();
      if (background !== "granted") {
        await RiderLocation.requestBackgroundPermission();
      }
      listener = await RiderLocation.addListener("location", onPosition);
      await RiderLocation.startTracking({ deliveryId, intervalMs: 5000 });
      return true;
    },
    async stop() {
      await RiderLocation.stopTracking();
      await listener?.remove();
      listener = null;
    },
  };
}

function createWebTracker(): LocationTracker {
  let watchId: number | null = null;
  return {
    source: "web",
    async start(_deliveryId, onPosition) {
      if (typeof navigator === "undefined" || !navigator.geolocation) return false;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (!settled) {
              settled = true;
              resolve(true);
            }
            onPosition({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading !== null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
              speed: pos.coords.speed !== null && !Number.isNaN(pos.coords.speed) ? pos.coords.speed : null,
              timestamp: pos.timestamp,
              isMock: false, // browsers don't expose mock status
            });
          },
          () => {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          },
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
        );
      });
    },
    async stop() {
      if (watchId !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    },
  };
}

export function createLocationTracker(): LocationTracker {
  return Capacitor.isNativePlatform() ? createNativeTracker() : createWebTracker();
}
