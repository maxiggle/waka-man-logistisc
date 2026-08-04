import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { inviteRequest } from "@/lib/inviteClient";

// Super-admin status is invite-gated, mirroring src/lib/admin.ts exactly —
// a user is promoted to role "superadmin" only if their email has a
// matching doc in `superadminInvites` (see AuthContext.tsx, checked on
// every sign-in). Deliberately a separate mechanism from adminInvites, not
// a flag layered on top of it: WM-101 Phase 2 exists precisely because
// "can see delivery/rider oversight" (admin) and "can change what customers
// are charged" (superadmin) are different grants a client may want to hand
// to different people. The very first invite has to be created by hand in
// the Firebase console, same bootstrap story as the first admin invite.
//
// KNOWN LIMITATION: role is a single field, so a user is exactly one of
// admin/rider/client/superadmin at a time — someone who needs both delivery
// oversight and pricing control needs two invites' worth of privilege
// collapsed into a role this schema can't represent yet. Not a problem this
// ticket needs to solve; revisit if that combination is actually needed.

export type SuperAdminInvite = {
  email: string;
  invitedBy: string;
  invitedAt: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailSuperAdminInvited(email: string): Promise<boolean> {
  if (!db || !email) return false;
  const snap = await getDoc(doc(db, "superadminInvites", normalizeEmail(email)));
  return snap.exists();
}

/**
 * Grants a superadmin invite. No invitedBy argument: the server takes the
 * caller's uid from the verified token, so it can't be misreported.
 */
export async function inviteSuperAdmin(email: string): Promise<void> {
  await inviteRequest("POST", "superadmin", email);
}

/**
 * Revokes a superadmin invite and steps down anyone already promoted under
 * it. No callerEmail argument — the self-revoke guard now compares against
 * the verified token's email server-side, where the caller can't supply the
 * value being checked against them.
 *
 * Two refusals, enforced in src/server/invites.ts:
 *
 *  - Self-revoke, outright rather than only when it's the last invite — a
 *    superadmin should always have someone else demote them, so a
 *    compromised or panicking account can't strand the seat.
 *  - Emptying the collection, regardless of who's revoking — there must
 *    always be a path back into /admin/pricing that doesn't need a console
 *    hand-edit.
 *
 * These used to live here, in browser code, while firestore.rules happily
 * allowed a superadmin to delete the invite document directly — so they
 * were advisory. On the server they're actually enforced.
 */
export async function revokeSuperAdminInvite(email: string): Promise<void> {
  await inviteRequest("DELETE", "superadmin", email);
}

export async function listSuperAdminInvites(): Promise<SuperAdminInvite[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "superadminInvites"));
  return snap.docs.map((d) => d.data() as SuperAdminInvite);
}
