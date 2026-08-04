// One-time rollout seed (WM-104), idempotent by construction: it only ever
// creates documents that are entirely absent, and never inspects — let
// alone repairs — one that already exists. That second half is load-
// bearing, not an oversight: a config/pricing doc that fails validation
// (corrupted, hand-edited badly) must keep failing quotes loudly
// (getPricingConfig() → null → 422), not get silently "fixed" back to
// whatever this script's constants say. Re-running this script must be
// exactly as safe as running it once.
//
// Run once per environment at rollout:
//   pnpm exec tsx scripts/seed.ts
//
// Needs the same env as the app itself — FIREBASE_SERVICE_ACCOUNT_B64 at
// minimum, loaded from .env.local here since this runs outside Next.js.
// Optionally set INITIAL_SUPERADMIN_EMAIL to also seed the first
// superadminInvites/{email} doc (WM-105) — without it, pricing seeds but
// stays unreachable until someone is invited by hand in the console.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getAdminDb } from "../src/server/firebaseAdmin";
import {
  SERVICE_LEVEL_PRICING,
  ROUNDING_KOBO,
  DETOUR_FACTOR,
  MAX_TRIP_DISTANCE_KM,
} from "../src/lib/dispatchConfig";
import type { PricingConfig } from "../src/lib/schemas";

async function seedPricingConfig(): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("config").doc("pricing");
  const snap = await ref.get();

  // Existence only — never parsed, never validated, never used to decide
  // whether to "fix" anything. A doc that exists but fails validation is
  // untouched by this script; that's WM-104's explicit requirement.
  if (snap.exists) {
    console.log("[seed] config/pricing already exists — leaving it untouched.");
    return;
  }

  const now = Date.now();
  const seeded: PricingConfig = {
    express: SERVICE_LEVEL_PRICING.express,
    standard: SERVICE_LEVEL_PRICING.standard,
    bulk: SERVICE_LEVEL_PRICING.bulk,
    roundingKobo: ROUNDING_KOBO,
    detourFactor: DETOUR_FACTOR,
    maxTripKm: MAX_TRIP_DISTANCE_KM,
    updatedAt: now,
    updatedBy: "seed-script",
  };
  await ref.set(seeded);
  console.log("[seed] Created config/pricing from dispatchConfig.ts seed values.");
}

async function seedInitialSuperAdminInvite(): Promise<void> {
  const email = process.env.INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const db = getAdminDb();
  const collectionRef = db.collection("superadminInvites");

  // "Only when the collection is empty" — checked every run, not just the
  // first — so setting/changing INITIAL_SUPERADMIN_EMAIL after a superadmin
  // already exists is a no-op, not a silent additional grant.
  const existing = await collectionRef.limit(1).get();
  if (!existing.empty) {
    console.log("[seed] superadminInvites already has at least one entry — leaving it untouched.");
    return;
  }

  if (!email) {
    console.log(
      "[seed] superadminInvites is empty and INITIAL_SUPERADMIN_EMAIL is not set — skipping. " +
        "Pricing is seeded but unreachable until someone is invited (console, or set this env var and re-run).",
    );
    return;
  }

  await collectionRef.doc(email).set({
    email,
    invitedBy: "seed-script",
    invitedAt: Date.now(),
  });
  console.log(`[seed] Created the first superadminInvites entry for ${email}.`);
}

async function main() {
  await seedPricingConfig();
  await seedInitialSuperAdminInvite();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  });
