import { auth } from "@/lib/firebase";

export async function requestAppAccess(): Promise<void> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch("/api/rider-access/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `App access request failed (${res.status})`);
  }
}

export async function approveRiderAccess(uid: string): Promise<void> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch(`/api/admin/rider-access/${uid}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Approval failed (${res.status})`);
  }
}

export async function rejectRiderAccess(uid: string): Promise<void> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch(`/api/admin/rider-access/${uid}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Rejection failed (${res.status})`);
  }
}

export async function resendRiderAccessLink(uid: string): Promise<void> {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not signed in.");

  const res = await fetch(`/api/admin/rider-access/${uid}/resend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Resend failed (${res.status})`);
  }
}
