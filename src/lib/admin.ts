import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { inviteRequest } from "@/lib/inviteClient";

// Admin status is invite-gated: a user is promoted to role "admin" only if
// their email has a matching doc in `adminInvites` (see AuthContext.tsx,
// which checks this on every sign-in). The very first invite has to be
// created by hand in the Firebase console — see admin-invites.md.

export type AdminInvite = {
  email: string;
  invitedBy: string;
  invitedAt: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailInvited(email: string): Promise<boolean> {
  if (!db || !email) return false;
  const snap = await getDoc(doc(db, "adminInvites", normalizeEmail(email)));
  return snap.exists();
}

/**
 * Grants an admin invite. No invitedBy argument: the server takes the
 * caller's uid from the verified token, so it can't be misreported.
 */
export async function inviteAdmin(email: string): Promise<void> {
  await inviteRequest("POST", "admin", email);
}

/**
 * Revokes an admin invite and steps down anyone already promoted under it,
 * so revoking actually takes access away rather than only blocking future
 * re-promotion. Both happen server-side (src/server/invites.ts) — the
 * step-down writes to another user's document, which firestore.rules no
 * longer permits from a browser.
 */
export async function revokeAdminInvite(email: string): Promise<void> {
  await inviteRequest("DELETE", "admin", email);
}

export async function listAdminInvites(): Promise<AdminInvite[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "adminInvites"));
  return snap.docs.map((d) => d.data() as AdminInvite);
}
