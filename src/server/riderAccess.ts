import { getAdminDb } from "@/server/firebaseAdmin";
import { isAdminOrSuperAdmin } from "@/server/roles";
import crypto from "crypto";
import { sendEmail } from "@/server/email";
import { RIDER_ACCESS_TOKEN_TTL_MS } from "@/lib/dispatchConfig";

export type RiderAccessResult =
  | { ok: true; downloadUrl?: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500 | 502; error: string };

function getAppOrigin(): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) {
    throw new Error("APP_ORIGIN is not configured.");
  }
  return origin;
}

export async function createRequest(
  uid: string,
  email: string,
  name: string
): Promise<RiderAccessResult> {
  try {
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (!userDoc.exists || userDoc.data()?.role !== "rider") {
      return { ok: false, status: 403, error: "Not a rider" };
    }

    const requestRef = db.collection("riderAccessRequests").doc(uid);
    try {
      await requestRef.create({
        uid,
        email,
        name,
        vehicle: userDoc.data()?.vehicle || "motorcycle",
        status: "pending",
        requestedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const isAlreadyExists =
        (typeof err === "object" &&
          err !== null &&
          "code" in err &&
          ((err as { code: unknown }).code === 6 ||
            (err as { code: unknown }).code === "ALREADY_EXISTS" ||
            (err as { code: unknown }).code === "already-exists")) ||
        (err instanceof Error && /already[- ]?exists/i.test(err.message));

      if (isAlreadyExists) {
        return { ok: true };
      }
      throw err;
    }

    return { ok: true };
  } catch (err) {
    console.error("Create request error:", err);
    return { ok: false, status: 500, error: "Failed to create request" };
  }
}

async function revokeOldTokens(db: FirebaseFirestore.Firestore, uid: string) {
  const tokensSnap = await db.collection("apkDownloadTokens").where("uid", "==", uid).get();
  const batch = db.batch();
  tokensSnap.docs.forEach((doc) => {
    batch.update(doc.ref, { revokedAt: new Date().toISOString() });
  });
  await batch.commit();
}

async function generateAndSendToken(
  db: FirebaseFirestore.Firestore,
  requestRef: FirebaseFirestore.DocumentReference,
  uid: string,
  emailToSend: string,
  adminUid: string,
  isResend: boolean
): Promise<RiderAccessResult> {
  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RIDER_ACCESS_TOKEN_TTL_MS).toISOString();
  const tokenRef = db.collection("apkDownloadTokens").doc(hashedToken);

  let appOrigin: string;
  try {
    appOrigin = getAppOrigin();
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Missing APP_ORIGIN" };
  }

  // Pre-check email config before doing anything in db
  try {
    const { getResendClient, getSenderEmail } = await import("@/server/email");
    getResendClient();
    getSenderEmail();
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Email config missing" };
  }

  if (isResend) {
    await revokeOldTokens(db, uid);
  }

  await db.runTransaction(async (t) => {
    const docSnap = await t.get(requestRef);
    if (!docSnap.exists) {
      throw new Error("404:Request not found");
    }
    const data = docSnap.data();
    if (!isResend && data?.status === "approved") {
      throw new Error("409:Already approved");
    }
    if (isResend && data?.status !== "approved") {
      throw new Error("409:Cannot resend if not approved");
    }

    if (!isResend) {
      t.update(requestRef, {
        status: "approved",
        reviewedBy: adminUid,
        reviewedAt: new Date().toISOString(),
      });
    }

    t.set(tokenRef, {
      uid,
      requestId: uid,
      expiresAt,
      usesCount: 0,
    });
  });

  const downloadLink = `${appOrigin}/download/${token}`;

  try {
    await sendEmail({
      to: emailToSend,
      subject: "Waka Man Rider App - Download Link",
      html: `<p>Your rider application has been approved!</p><p>Download the rider app here: <a href="${downloadLink}">${downloadLink}</a></p><p>This link is valid for 48 hours.</p>`,
    });
    return { ok: true, downloadUrl: downloadLink };
  } catch (err) {
    console.error("Resend send failed:", err);
    return { ok: false, status: 502, error: "Approved, but the email failed. Use Resend link." };
  }
}

export async function approve(adminUid: string, riderUid: string): Promise<RiderAccessResult> {
  if (!(await isAdminOrSuperAdmin(adminUid))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const db = getAdminDb();
  const requestRef = db.collection("riderAccessRequests").doc(riderUid);
  const docSnap = await requestRef.get();
  if (!docSnap.exists) return { ok: false, status: 404, error: "Request not found" };
  const data = docSnap.data();

  if (data?.status === "approved") {
    return { ok: false, status: 409, error: "Already approved" };
  }

  try {
    return await generateAndSendToken(db, requestRef, riderUid, data?.email, adminUid, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404:")) return { ok: false, status: 404, error: "Request not found" };
    if (msg.includes("409:")) return { ok: false, status: 409, error: "Already approved" };
    return { ok: false, status: 500, error: "Failed to approve" };
  }
}

export async function isApprovedRider(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const db = getAdminDb();
    const docSnap = await db.collection("riderAccessRequests").doc(uid).get();
    return docSnap.exists && docSnap.data()?.status === "approved";
  } catch (err) {
    console.error(`Error checking rider approval for ${uid}:`, err);
    return false;
  }
}

export async function reject(adminUid: string, riderUid: string): Promise<RiderAccessResult> {
  if (!(await isAdminOrSuperAdmin(adminUid))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const db = getAdminDb();
  const requestRef = db.collection("riderAccessRequests").doc(riderUid);

  try {
    const docSnap = await requestRef.get();
    if (!docSnap.exists) {
      return { ok: false, status: 404, error: "Request not found" };
    }
    if (docSnap.data()?.status === "rejected") {
      return { ok: false, status: 409, error: "Already rejected" };
    }

    // 1 & 2. Mark the request rejected and drop availability first, in their
    // own batch, ahead of touching any offered deliveries below. Flipping
    // riderAccessRequests to "rejected" first means acceptDelivery's
    // in-transaction approval check (src/server/deliveryOffers.ts) starts
    // failing as early as possible, shrinking the window in which the rider
    // could still accept an offer out from under this revoke.
    const batch = db.batch();
    batch.update(requestRef, {
      status: "rejected",
      reviewedBy: adminUid,
      reviewedAt: new Date().toISOString(),
    });
    batch.delete(db.collection("riderAvailability").doc(riderUid));
    await batch.commit();

    // 3. Remove the rider from offeredTo on currently offered deliveries,
    // reverting to pending if no other recipient is left. The query below is
    // a snapshot — by the time we get here the rider may have already
    // accepted one of these deliveries (racing this revoke) — so each
    // delivery gets its own transaction that re-reads and re-checks
    // status/offeredTo immediately before writing, rather than one shared
    // batch built from stale data. That way an accept that raced ahead of us
    // is left alone instead of being clobbered back to "pending" while
    // riderId/rider are still set. Mirrors sweepExpiredOffers
    // (src/server/dispatch.ts) and rejectDelivery (src/server/deliveryOffers.ts).
    // Failures are logged per-delivery, not thrown, so one bad delivery
    // doesn't stop the revoke from having taken effect.
    const offeredDeliveries = await db
      .collection("deliveries")
      .where("status", "==", "offered")
      .where("offeredTo", "array-contains", riderUid)
      .get();

    await Promise.all(
      offeredDeliveries.docs.map(async (dSnap) => {
        const ref = dSnap.ref;
        try {
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(ref);
            if (!fresh.exists) return;
            const data = fresh.data()!;
            if (data.status !== "offered") return;
            const offeredTo: string[] = Array.isArray(data.offeredTo) ? data.offeredTo : [];
            if (!offeredTo.includes(riderUid)) return;

            const remaining = offeredTo.filter((id) => id !== riderUid);
            if (remaining.length === 0) {
              tx.update(ref, {
                status: "pending",
                offeredTo: [],
                offeredAt: null,
                offerExpiresAt: null,
              });
            } else {
              tx.update(ref, { offeredTo: remaining });
            }
          });
        } catch (err) {
          console.error(`Failed to revoke offer on delivery ${ref.id} for rider ${riderUid}:`, err);
        }
      }),
    );

    return { ok: true };
  } catch (err) {
    console.error("Reject/revoke error:", err);
    return { ok: false, status: 500, error: "Failed to reject" };
  }
}

export async function resendLink(adminUid: string, riderUid: string): Promise<RiderAccessResult> {
  if (!(await isAdminOrSuperAdmin(adminUid))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const db = getAdminDb();
  const requestRef = db.collection("riderAccessRequests").doc(riderUid);
  const docSnap = await requestRef.get();
  if (!docSnap.exists) return { ok: false, status: 404, error: "Request not found" };
  const data = docSnap.data();

  if (data?.status !== "approved") {
    return { ok: false, status: 409, error: "Cannot resend if not approved" };
  }

  try {
    return await generateAndSendToken(db, requestRef, riderUid, data?.email, adminUid, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404:")) return { ok: false, status: 404, error: "Request not found" };
    if (msg.includes("409:")) return { ok: false, status: 409, error: "Cannot resend if not approved" };
    return { ok: false, status: 500, error: "Failed to resend" };
  }
}

export async function redeemToken(token: string): Promise<RiderAccessResult> {
  if (!token) return { ok: false, status: 400, error: "Missing token" };

  try {
    const { getAdminStorage } = await import("@/server/firebaseAdmin");
    const { APK_TOKEN_MAX_USES, APK_SIGNED_URL_TTL_MS } = await import("@/lib/dispatchConfig");
    
    const db = getAdminDb();
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const tokenRef = db.collection("apkDownloadTokens").doc(hashedToken);

    const directDownloadUrl = process.env.APK_DOWNLOAD_URL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let file: any = null;

    if (!directDownloadUrl) {
      const path = process.env.APK_STORAGE_PATH;
      if (!path) {
        console.error("Neither APK_DOWNLOAD_URL nor APK_STORAGE_PATH is configured.");
        return { ok: false, status: 500, error: "Download is currently unavailable. Please try again later." };
      }

      const storage = getAdminStorage();
      file = storage.bucket().file(path);
      const [exists] = await file.exists();
      if (!exists) {
        console.error("APK file not found in bucket:", path);
        return { ok: false, status: 404, error: "The app file is currently unavailable. Please contact support." };
      }
    }

    let isApproved = false;

    await db.runTransaction(async (t) => {
      const tokenSnap = await t.get(tokenRef);
      if (!tokenSnap.exists) {
        throw new Error("404:This link has expired. Ask the Waka Man team for a new one.");
      }

      const tokenData = tokenSnap.data();
      if (tokenData?.revokedAt) {
        throw new Error("409:This link has expired. Ask the Waka Man team for a new one.");
      }
      if (tokenData?.usesCount >= APK_TOKEN_MAX_USES) {
        throw new Error("409:This link has expired. Ask the Waka Man team for a new one.");
      }
      
      const expiresAt = new Date(tokenData?.expiresAt).getTime();
      if (Date.now() > expiresAt) {
        throw new Error("409:This link has expired. Ask the Waka Man team for a new one.");
      }

      const requestRef = db.collection("riderAccessRequests").doc(tokenData?.requestId);
      const requestSnap = await t.get(requestRef);
      
      if (!requestSnap.exists || requestSnap.data()?.status !== "approved") {
        throw new Error("409:This link has expired. Ask the Waka Man team for a new one.");
      }

      isApproved = true;

      t.update(tokenRef, {
        usesCount: (tokenData?.usesCount || 0) + 1,
        lastUsedAt: new Date().toISOString(),
      });
    });

    if (!isApproved) {
      return { ok: false, status: 409, error: "This link has expired. Ask the Waka Man team for a new one." };
    }

    if (directDownloadUrl) {
      return { ok: true, downloadUrl: directDownloadUrl };
    }

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + APK_SIGNED_URL_TTL_MS,
    });

    return { ok: true, downloadUrl: url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404:")) return { ok: false, status: 404, error: msg.split("404:")[1] };
    if (msg.includes("409:")) return { ok: false, status: 409, error: msg.split("409:")[1] };
    return { ok: false, status: 500, error: "Failed to process download link" };
  }
}
