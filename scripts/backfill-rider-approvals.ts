// Backfill script for existing riders created prior to WM-106 (WM-108).
// It creates riderAccessRequests/{uid} with status: "approved" for every users
// document with role == "rider" that does NOT yet have a request.
//
// Safe to run repeatedly:
// - skips riders who already have a request
// - never overwrites existing pending or rejected requests
// - uses create() so it cannot overwrite existing records
//
// Usage:
//   pnpm exec tsx scripts/backfill-rider-approvals.ts --dry-run
//   pnpm exec tsx scripts/backfill-rider-approvals.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getAdminDb } from "../src/server/firebaseAdmin";

async function backfillRiderApprovals(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  const db = getAdminDb();

  console.log(`[backfill] Starting rider approval backfill ${isDryRun ? "(DRY RUN)" : "(LIVE)"}...`);

  const ridersSnap = await db.collection("users").where("role", "==", "rider").get();
  const totalRiders = ridersSnap.size;
  console.log(`[backfill] Found ${totalRiders} user(s) with role="rider".`);

  if (totalRiders === 0) {
    console.log("[backfill] No riders found. Exiting.");
    return;
  }

  const riderDocs = ridersSnap.docs;
  const requestRefs = riderDocs.map((d) => db.collection("riderAccessRequests").doc(d.id));
  const requestSnaps = await db.getAll(...requestRefs);

  let alreadyHadRequest = 0;
  let toBackfill = 0;
  const eligibleRiders: Array<{
    uid: string;
    email: string;
    name: string;
    vehicle: string;
  }> = [];

  for (let i = 0; i < riderDocs.length; i++) {
    const userDoc = riderDocs[i];
    const reqSnap = requestSnaps[i];
    const uid = userDoc.id;

    if (reqSnap.exists) {
      alreadyHadRequest++;
      const currentStatus = reqSnap.data()?.status;
      console.log(`[backfill] Skipping ${uid}: already has request with status "${currentStatus}".`);
      continue;
    }

    const userData = userDoc.data();
    eligibleRiders.push({
      uid,
      email: typeof userData.email === "string" ? userData.email : "",
      name: typeof userData.name === "string" ? userData.name : "Rider",
      vehicle: typeof userData.vehicle === "string" ? userData.vehicle : "motorcycle",
    });
    toBackfill++;
  }

  console.log(`\n--- Backfill Summary ---`);
  console.log(`Total riders scanned:    ${totalRiders}`);
  console.log(`Already have a request:  ${alreadyHadRequest}`);
  console.log(`To be backfilled:        ${toBackfill}`);

  if (isDryRun) {
    console.log(`\n[backfill] Dry run complete. No documents were created.`);
    return;
  }

  if (toBackfill === 0) {
    console.log(`\n[backfill] No riders need backfilling. Done.`);
    return;
  }

  const nowIso = new Date().toISOString();
  console.log(`\n[backfill] Writing ${toBackfill} approval document(s)...`);

  let createdCount = 0;
  for (const rider of eligibleRiders) {
    const ref = db.collection("riderAccessRequests").doc(rider.uid);
    try {
      await ref.create({
        uid: rider.uid,
        email: rider.email,
        name: rider.name,
        vehicle: rider.vehicle,
        status: "approved",
        reviewedBy: "backfill",
        reviewedAt: nowIso,
        requestedAt: nowIso,
      });
      createdCount++;
      console.log(`[backfill] Created approval for ${rider.uid} (${rider.email})`);
    } catch (err: unknown) {
      console.error(`[backfill] Failed to create approval for ${rider.uid}:`, err);
    }
  }

  console.log(`\n[backfill] Successfully backfilled ${createdCount} of ${toBackfill} rider(s).`);
}

backfillRiderApprovals()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  });
