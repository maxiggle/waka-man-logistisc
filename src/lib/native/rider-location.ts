import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** A single GPS fix, shared shape between the Kotlin plugin and the web fallback. */
export type RiderPosition = {
  lat: number;
  lng: number;
  /** metres */
  accuracy: number;
  /** degrees clockwise from north; null when the device can't tell */
  heading: number | null;
  /** metres per second; null when unknown */
  speed: number | null;
  /** epoch millis of the fix */
  timestamp: number;
  /** true when Android flagged the fix as coming from a mock provider */
  isMock: boolean;
};

export type PermissionState = "granted" | "denied" | "prompt";

export interface RiderLocationPlugin {
  checkPermissions(): Promise<{ location: PermissionState; background: PermissionState }>;
  /** Request fine location. Background must be requested separately after this is granted. */
  requestPermissions(): Promise<{ location: PermissionState }>;
  requestBackgroundPermission(): Promise<{ background: PermissionState }>;
  /** Starts the foreground service and begins emitting `location` events. */
  startTracking(options: { deliveryId: string; intervalMs?: number }): Promise<void>;
  stopTracking(): Promise<void>;
  isTracking(): Promise<{ tracking: boolean }>;
  addListener(
    eventName: "location",
    listener: (position: RiderPosition) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const RiderLocation = registerPlugin<RiderLocationPlugin>("RiderLocation");
