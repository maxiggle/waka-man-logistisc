import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

export async function inviteAdmin(email: string, invitedByUid: string): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  const normalized = normalizeEmail(email);
  const invite: AdminInvite = {
    email: normalized,
    invitedBy: invitedByUid,
    invitedAt: Date.now(),
  };
  await setDoc(doc(db, "adminInvites", normalized), invite);
}

export async function revokeAdminInvite(email: string): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  const normalized = normalizeEmail(email);
  await deleteDoc(doc(db, "adminInvites", normalized));

  // Also step down anyone already promoted under this invite so revoking
  // access actually takes it away, not just blocks future re-promotion.
  const usersQuery = query(collection(db, "users"), where("email", "==", normalized));
  const usersSnap = await getDocs(usersQuery);
  await Promise.all(
    usersSnap.docs
      .filter((d) => d.data().role === "admin")
      .map((d) => setDoc(doc(db!, "users", d.id), { role: "client" }, { merge: true }))
  );
}

export async function listAdminInvites(): Promise<AdminInvite[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "adminInvites"));
  return snap.docs.map((d) => d.data() as AdminInvite);
}
