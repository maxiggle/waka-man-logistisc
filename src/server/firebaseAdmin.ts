// Server-only Firebase Admin bootstrap. Never import this from client code —
// FIREBASE_SERVICE_ACCOUNT_B64 is root access to the whole project, bypassing
// every Firestore security rule. Consumers must declare `export const runtime
// = "nodejs"` — the Admin SDK needs Node built-ins and does not run on Edge.
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

// Vercel Fluid Compute reuses instances across invocations, so a warm request
// hitting this module again must not re-initialize — mirrors the
// getApps().length guard already used in src/lib/firebase.ts.
function getAdminApp(): App {
  if (getApps().length) return getApp();

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!encoded) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_B64 is not set. Add it to your environment (see .env.example) — required on Vercel for Preview and Production.",
    );
  }

  const serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  return initializeApp({ credential: cert(serviceAccount) });
}

// Resolved lazily on every call rather than cached in a module-level
// variable populated at import — the whole point is that nothing touches
// credentials until a request actually arrives. getFirestore()/getAdminApp()
// are cheap on a warm instance (both just look up an already-registered
// singleton), so there's no cost to not caching this ourselves.
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * Verifies the `Authorization: Bearer <idToken>` header, returning the
 * caller's uid or null. A missing/malformed/invalid/expired token yields
 * null (→ 401 at the route). A missing FIREBASE_SERVICE_ACCOUNT_B64 is a
 * different failure mode — an infra/config problem, not an auth problem —
 * so getAdminApp() is called outside the verify try/catch and its error is
 * left to propagate; route handlers catch it and return a generic 500
 * rather than misreporting it as "Unauthorized".
 */
export async function getUidFromRequest(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) return null;

  const app = getAdminApp();
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}
