"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured, db } from "@/lib/firebase";
import { hasAdminAccess } from "@/lib/roles";
import { approveRiderAccess, rejectRiderAccess, resendRiderAccessLink } from "@/lib/riderAccess";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

type RiderRequest = {
  uid: string;
  email: string;
  name: string;
  vehicle: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export default function AdminRidersPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUserProfile } = useAuth();

  const [requests, setRequests] = useState<RiderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [processingState, setProcessingState] = useState<{ [uid: string]: string }>({});
  const [rowMessage, setRowMessage] = useState<{ [uid: string]: { type: "error" | "success", text: string } }>({});

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/admin/riders");
      return;
    }

    let cancelled = false;
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      const admin = hasAdminAccess(profile?.role);
      setIsAdmin(admin);
      setCheckingAdmin(false);
      if (!admin) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router, refreshUserProfile]);

  async function loadRequests() {
    if (!isFirebaseConfigured || !db) {
      setLoading(false);
      return;
    }
    try {
      const q = query(collection(db, "riderAccessRequests"), orderBy("requestedAt", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => doc.data() as RiderRequest);
      setRequests(list);
    } catch (err) {
      console.error("Failed to load rider requests:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;
    loadRequests().catch(console.error);
  }, [authLoading, checkingAdmin, user, isAdmin]);

  async function handleApprove(uid: string) {
    setProcessingState(prev => ({ ...prev, [uid]: "Approve" }));
    setRowMessage(prev => ({ ...prev, [uid]: { type: "success", text: "" } }));
    try {
      await approveRiderAccess(uid);
      await loadRequests();
    } catch (err) {
      console.error("Failed to approve:", err);
      setRowMessage(prev => ({ ...prev, [uid]: { type: "error", text: err instanceof Error ? err.message : "Failed to approve" } }));
      await loadRequests().catch(console.error);
    } finally {
      setProcessingState(prev => ({ ...prev, [uid]: "" }));
    }
  }

  async function handleReject(uid: string) {
    setProcessingState(prev => ({ ...prev, [uid]: "Reject" }));
    setRowMessage(prev => ({ ...prev, [uid]: { type: "success", text: "" } }));
    try {
      await rejectRiderAccess(uid);
      await loadRequests();
    } catch (err) {
      console.error("Failed to reject:", err);
      setRowMessage(prev => ({ ...prev, [uid]: { type: "error", text: err instanceof Error ? err.message : "Failed to reject" } }));
    } finally {
      setProcessingState(prev => ({ ...prev, [uid]: "" }));
    }
  }

  async function handleResend(uid: string) {
    setProcessingState(prev => ({ ...prev, [uid]: "Resend" }));
    setRowMessage(prev => ({ ...prev, [uid]: { type: "success", text: "" } }));
    try {
      await resendRiderAccessLink(uid);
      setRowMessage(prev => ({ ...prev, [uid]: { type: "success", text: "New link sent!" } }));
    } catch (err) {
      console.error("Failed to resend:", err);
      setRowMessage(prev => ({ ...prev, [uid]: { type: "error", text: err instanceof Error ? err.message : "Failed to resend link" } }));
    } finally {
      setProcessingState(prev => ({ ...prev, [uid]: "" }));
    }
  }

  if (authLoading || checkingAdmin || !user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

  const pendingRequests = requests.filter(r => r.status === "pending");
  const historyRequests = requests.filter(r => r.status !== "pending");

  return (
    <main className="min-h-screen bg-[#141019] text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark-white.png" alt="" className="h-8 w-auto" />
            <span>
              waka man
              <span className="block text-[9px] font-bold tracking-[0.3em] uppercase text-accent">
                Dispatch Admin
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/admin" className="font-semibold text-white/60 hover:text-white transition-colors">
              ← Back to dashboard
            </Link>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Rider Onboarding</p>
        <h1 className="mt-1 text-2xl font-extrabold">App Access Requests</h1>
        <p className="mt-2 text-sm text-white/50 max-w-xl">
          Approve riders to send them a secure link to download the rider APK. Links are single-use and valid for 48 hours.
        </p>

        <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
            Pending Requests ({pendingRequests.length})
          </p>
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm animate-pulse">Loading requests...</div>
          ) : pendingRequests.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">No pending requests.</div>
          ) : (
            <ul>
              {pendingRequests.map((req) => (
                <li
                  key={req.uid}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold">{req.name}</p>
                    <p className="text-xs text-white/60">{req.email}</p>
                    <p className="text-xs text-white/40 mt-1">
                      Vehicle: <span className="capitalize">{req.vehicle}</span> &middot; Requested {new Date(req.requestedAt).toLocaleDateString()}
                    </p>
                    {rowMessage[req.uid]?.text && (
                      <p className={`text-xs mt-1 font-semibold ${rowMessage[req.uid].type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {rowMessage[req.uid].text}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleReject(req.uid)}
                      disabled={!!processingState[req.uid]}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {processingState[req.uid] === "Reject" ? "Rejecting..." : "Reject"}
                    </button>
                    <button
                      onClick={() => handleApprove(req.uid)}
                      disabled={!!processingState[req.uid]}
                      className="rounded-xl bg-accent text-[#141019] font-bold text-xs px-4 py-2 hover:bg-accent-tint transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {processingState[req.uid] === "Approve" ? "Approving..." : "Approve & Email Link"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
            Request History
          </p>
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm animate-pulse">Loading history...</div>
          ) : historyRequests.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">No past requests.</div>
          ) : (
            <ul>
              {historyRequests.map((req) => (
                <li
                  key={req.uid}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold">{req.name}</p>
                    <p className="text-xs text-white/60">{req.email}</p>
                    <p className="text-xs text-white/40 mt-1">
                      <span className={`uppercase font-bold tracking-wider text-[10px] ${req.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {req.status}
                      </span>
                      {" "} &middot; {new Date(req.reviewedAt || req.requestedAt).toLocaleDateString()}
                    </p>
                    {rowMessage[req.uid]?.text && (
                      <p className={`text-xs mt-1 font-semibold ${rowMessage[req.uid].type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {rowMessage[req.uid].text}
                      </p>
                    )}
                  </div>
                  {req.status === "approved" && (
                    <button
                      onClick={() => handleResend(req.uid)}
                      disabled={!!processingState[req.uid]}
                      className="text-xs font-semibold text-accent hover:text-accent-tint transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {processingState[req.uid] === "Resend" ? "Resending..." : "Resend Link"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
