import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { getApps } from "firebase-admin/app";
import { getAdminDb } from "../src/server/firebaseAdmin";

async function deployFirestoreRules() {
  getAdminDb();
  const app = getApps()[0];
  const credential = app.options.credential;
  if (!credential) {
    throw new Error("Firebase Admin app has no credential — is FIREBASE_SERVICE_ACCOUNT_B64 set?");
  }
  const token = await credential.getAccessToken();

  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf8");

  // Determine project ID from service account or env
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  let projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (encoded) {
    try {
      const sa = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (sa.project_id) projectId = sa.project_id;
    } catch {}
  }

  if (!projectId) {
    throw new Error("Unable to determine Firebase projectId.");
  }

  console.log(`[rules] Uploading firestore.rules to project "${projectId}"...`);
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: {
          files: [{ name: "firestore.rules", content: rulesContent }],
        },
      }),
    }
  );

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create ruleset (${createRes.status}): ${errorText}`);
  }

  const rulesetData = (await createRes.json()) as { name: string };
  console.log(`[rules] Ruleset created: ${rulesetData.name}`);

  console.log(`[rules] Releasing ruleset to cloud.firestore...`);
  const releaseRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        release: {
          name: `projects/${projectId}/releases/cloud.firestore`,
          rulesetName: rulesetData.name,
        },
      }),
    }
  );

  if (!releaseRes.ok) {
    const errorText = await releaseRes.text();
    throw new Error(`Failed to release ruleset (${releaseRes.status}): ${errorText}`);
  }

  console.log(`[rules] Successfully deployed and released firestore.rules to cloud.firestore!`);
}

deployFirestoreRules().catch((err) => {
  console.error("[rules] Deploy failed:", err);
  process.exit(1);
});
