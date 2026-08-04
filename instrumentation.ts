// Next.js instrumentation hook — register() runs once per server instance
// cold start. WM-104's "distinct startup-level log line": a total booking
// outage from a missing/corrupted config/pricing (see
// src/server/pricingConfig.ts) currently only surfaces as a per-request 422,
// easy to miss in the noise of normal traffic. This gives an operator
// scanning cold-start logs a chance to see it before the first customer
// complaint does.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getPricingConfig } = await import("@/server/pricingConfig");
  try {
    const config = await getPricingConfig();
    if (!config) {
      // getPricingConfig() already logged the specific reason
      // (missing vs. failed validation) — this line exists to be the one
      // that's unmissable at cold start, not to duplicate that detail.
      console.error("[startup] config/pricing is unhealthy — booking is DOWN. See the error above for why.");
    }
  } catch (err) {
    console.error("[startup] Failed to check config/pricing at startup:", err);
  }
}
