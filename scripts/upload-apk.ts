import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { getAdminStorage } from "../src/server/firebaseAdmin";

async function uploadApk() {
  const customPath = process.argv[2];
  const defaultRelease = path.resolve(
    process.cwd(),
    "android/app/build/outputs/apk/release/app-release.apk"
  );
  const defaultUnsigned = path.resolve(
    process.cwd(),
    "android/app/build/outputs/apk/release/app-release-unsigned.apk"
  );
  const defaultDebug = path.resolve(
    process.cwd(),
    "android/app/build/outputs/apk/debug/app-debug.apk"
  );

  let localApkPath = customPath ? path.resolve(process.cwd(), customPath) : "";

  if (!localApkPath) {
    if (fs.existsSync(defaultRelease)) {
      localApkPath = defaultRelease;
    } else if (fs.existsSync(defaultUnsigned)) {
      localApkPath = defaultUnsigned;
    } else if (fs.existsSync(defaultDebug)) {
      localApkPath = defaultDebug;
    }
  }

  if (!localApkPath || !fs.existsSync(localApkPath)) {
    console.error(
      "[upload-apk] No APK found to upload. Looked at:\n" +
        `  ${defaultRelease}\n` +
        `  ${defaultUnsigned}\n` +
        `  ${defaultDebug}\n\n` +
        "Run `./gradlew assembleRelease` or `./gradlew assembleDebug` first, or provide the path: pnpm upload:apk <path-to-apk>"
    );
    process.exit(1);
  }

  const destination = process.env.APK_STORAGE_PATH || "rider-app/app-release.apk";
  const stats = fs.statSync(localApkPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`[upload-apk] Found APK at: ${localApkPath} (${sizeMb} MB)`);
  console.log(`[upload-apk] Target storage destination: ${destination}`);

  const storage = getAdminStorage();
  const bucket = storage.bucket();

  console.log(`[upload-apk] Uploading to bucket "${bucket.name}"...`);
  await bucket.upload(localApkPath, {
    destination,
    metadata: {
      contentType: "application/vnd.android.package-archive",
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalFileName: path.basename(localApkPath),
      },
    },
  });

  console.log(`[upload-apk] Successfully uploaded APK to gs://${bucket.name}/${destination}`);
}

uploadApk().catch((err) => {
  console.error("[upload-apk] Upload failed:", err);
  process.exit(1);
});
