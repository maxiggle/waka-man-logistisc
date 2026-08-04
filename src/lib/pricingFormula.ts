// The one place fare = max(minimum, base + perKm × roadKm), rounded up to
// the nearest rounding step, is computed — imported by both src/server/fare.ts
// (the actual charge) and the admin pricing dashboard's live preview table
// (src/app/admin/pricing/page.tsx). Sharing this function is what keeps the
// preview honest: if the formula lived twice, the preview could drift from
// what a customer is actually charged, which is exactly the kind of
// mismatch WM-101 exists to prevent at the booking layer.
//
// Pure and synchronous — no Firestore, no fetch — so it's safe to call on
// every keystroke in the admin form without debouncing.

export interface PricingTier {
  baseKobo: number;
  perKmKobo: number;
  minimumKobo: number;
}

export function computeFareKobo(tier: PricingTier, roundingKobo: number, distanceKm: number): number {
  const fare = Math.max(tier.minimumKobo, tier.baseKobo + tier.perKmKobo * distanceKm);
  return Math.ceil(fare / roundingKobo) * roundingKobo;
}
