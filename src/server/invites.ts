// Invite grant/revoke, on the Admin SDK.
//
// These moved server-side to close a privilege escalation. The users
// update rule used to end in an unconstrained `|| isAdmin()`, which existed
// so that client-side revocation could step a demoted user down by writing
// role onto *their* document. That same clause let any admin write
// role: "superadmin" onto their own document straight from the browser —
// granting themselves pricing control and defeating the whole point of
// superadmin being a separate invite. It also let an admin forge
// deliveriesCompleted and ratingAvg, the exact fields the self-arm of that
// rule goes to trouble to protect.
//
// Constraining the rule and leaving revocation in the browser would have
// silently broken revocation again. So role mutation lives here instead:
// the rule now denies every client write to another user's document, and
// the only thing that can change a role is this module, behind a verified
// token and a role check that reads from Firestore rather than the request.
//
// The last-superadmin and no-self-revoke guards move with it. They were
// business rules enforced client-side, which meant a superadmin could
// sidestep them by deleting the invite document directly — rules permitted
// that. Here they are actually enforced.

import { getAdminDb } from "@/server/firebaseAdmin";
import { isSuperAdmin, isAdminOrSuperAdmin } from "@/server/roles";

export type InviteKind = "admin" | "superadmin";

const COLLECTION: Record<InviteKind, string> = {
  admin: "adminInvites",
  superadmin: "superadminInvites",
};

export type InviteResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 409 | 500; error: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Granting an admin invite requires admin; granting a superadmin invite
 * requires superadmin. An admin must not be able to hand out the one grant
 * they don't hold — that would just be the escalation again, one step
 * removed.
 */
async function authorize(kind: InviteKind, callerUid: string): Promise<boolean> {
  return kind === "superadmin"
    ? isSuperAdmin(callerUid)
    : isAdminOrSuperAdmin(callerUid);
}

export async function grantInvite(
  kind: InviteKind,
  email: unknown,
  callerUid: string,
): Promise<InviteResult> {
  if (typeof email !== "string" || !isValidEmail(email.trim())) {
    return { ok: false, status: 400, error: "A valid email address is required." };
  }
  if (!(await authorize(kind, callerUid))) {
    return { ok: false, status: 403, error: "You don't have permission to grant this." };
  }

  const normalized = normalizeEmail(email);
  await getAdminDb()
    .collection(COLLECTION[kind])
    .doc(normalized)
    .set({ email: normalized, invitedBy: callerUid, invitedAt: Date.now() });

  return { ok: true };
}

export async function revokeInvite(
  kind: InviteKind,
  email: unknown,
  callerUid: string,
  callerEmail: string | null,
): Promise<InviteResult> {
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, status: 400, error: "An email address is required." };
  }
  if (!(await authorize(kind, callerUid))) {
    return { ok: false, status: 403, error: "You don't have permission to revoke this." };
  }

  const normalized = normalizeEmail(email);
  const db = getAdminDb();
  const collectionRef = db.collection(COLLECTION[kind]);

  if (kind === "superadmin") {
    // Self-revoke is refused outright rather than only when it's the last
    // one: a superadmin should always have someone else demote them, so a
    // compromised or panicking account can't strand the seat.
    if (callerEmail && normalized === normalizeEmail(callerEmail)) {
      return {
        ok: false,
        status: 409,
        error: "You can't revoke your own superadmin access — have another superadmin do it.",
      };
    }

    // There must always be a way back into /admin/pricing that doesn't
    // require a console hand-edit.
    const all = await collectionRef.get();
    const wouldEmpty = all.size <= 1 && all.docs.some((d) => d.id === normalized);
    if (wouldEmpty) {
      return {
        ok: false,
        status: 409,
        error: "Can't remove the last superadmin — invite another one first.",
      };
    }
  }

  await collectionRef.doc(normalized).delete();

  // Step down anyone already promoted under this invite. Without this,
  // revoking only blocks future re-promotion and leaves current access
  // intact until the user happens to sign in again.
  //
  // Filtered on role === kind so revoking one grant never disturbs the
  // other: a superadmin who also has an admin invite revoked keeps
  // superadmin, and vice versa.
  const holders = await db.collection("users").where("email", "==", normalized).get();
  await Promise.all(
    holders.docs
      .filter((d) => d.data()?.role === kind)
      .map((d) => d.ref.set({ role: "client" }, { merge: true })),
  );

  return { ok: true };
}
