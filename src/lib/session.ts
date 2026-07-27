// Tracks whether this device has ever completed a sign-in, independent of
// whether a Firebase session is currently active. Firebase's own session can
// outlive or be cleared separately from this flag — this is purely "has this
// browser/app seen a signed-in user before," used to decide whether "/"
// should show the marketing landing page (first-time devices only) or skip
// straight to login/dashboard (every returning device, session or not).
const RETURNING_DEVICE_KEY = "wm:returning-device";

export function isReturningDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RETURNING_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markReturningDevice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETURNING_DEVICE_KEY, "1");
  } catch {
    // Storage unavailable (e.g. private mode) — landing page will just
    // keep showing on this device, which is a safe fallback.
  }
}
