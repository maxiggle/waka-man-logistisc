// Thin client wrapper around /api/admin/invites, shared by src/lib/admin.ts
// and src/lib/superadmin.ts. Attaches the caller's Firebase ID token and
// shapes the error; contains no invite logic of its own.
//
// Invite writes are no longer possible from the browser at all —
// firestore.rules denies writes to both invite collections — because
// revoking has to step the demoted user down, which means writing to
// someone else's users/{uid} document. See src/server/invites.ts.

import { auth } from "@/lib/firebase";

export type InviteKind = "admin" | "superadmin";

export async function inviteRequest(
  method: "POST" | "DELETE",
  kind: InviteKind,
  email: string,
): Promise<void> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch("/api/admin/invites", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ kind, email }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    // The server's message is the useful one here — "you can't revoke your
    // own superadmin access" and "can't remove the last superadmin" are
    // both things the person clicking needs to read.
    throw new Error(data?.error || `Invite request failed (${res.status})`);
  }
}
