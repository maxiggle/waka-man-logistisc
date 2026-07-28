"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import { inviteAdmin, listAdminInvites, revokeAdminInvite, type AdminInvite } from "@/lib/admin";

export default function AdminTeamPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUserProfile } = useAuth();

  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Re-check invite/admin status on every visit — see refreshUserProfile
  // in AuthContext.tsx for why this can't just rely on cached context state.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/admin/team");
      return;
    }

    let cancelled = false;
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      const admin = profile?.role === "admin";
      setIsAdmin(admin);
      setCheckingAdmin(false);
      if (!admin) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router, refreshUserProfile]);

  useEffect(() => {
    if (authLoading || checkingAdmin || !user || !isAdmin) return;

    async function load() {
      if (!isFirebaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        setInvites(await listAdminInvites());
      } catch (err) {
        console.error("Failed to load admin invites:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, checkingAdmin, user, isAdmin]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSubmitting(true);
    try {
      await inviteAdmin(email, user.uid);
      setEmail("");
      setInvites(await listAdminInvites());
    } catch (err) {
      console.error("Failed to invite admin:", err);
      setError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(inviteEmail: string) {
    setRevoking(inviteEmail);
    try {
      await revokeAdminInvite(inviteEmail);
      setInvites((prev) => prev.filter((i) => i.email !== inviteEmail));
    } catch (err) {
      console.error("Failed to revoke admin invite:", err);
      setError(err instanceof Error ? err.message : "Failed to revoke access.");
    } finally {
      setRevoking(null);
    }
  }

  if (authLoading || checkingAdmin || !user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

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

      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Team access</p>
        <h1 className="mt-1 text-2xl font-extrabold">Manage admins</h1>
        <p className="mt-2 text-sm text-white/50 max-w-xl">
          Invited emails are promoted to admin the next time they sign in with Google — no password or
          separate account needed. Revoking an invite also steps down anyone already signed in under it.
        </p>

        <form onSubmit={handleInvite} className="mt-6 flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-accent text-[#141019] font-bold text-sm px-5 py-3 hover:bg-accent-tint transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "Inviting..." : "Invite as admin"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
            Invited admins
          </p>
          {loading ? (
            <div className="p-8 text-center text-white/40 text-sm animate-pulse">Loading invites...</div>
          ) : invites.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">No admins invited yet.</div>
          ) : (
            <ul>
              {invites.map((invite) => (
                <li
                  key={invite.email}
                  className="flex items-center justify-between px-5 py-3 border-t border-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold">{invite.email}</p>
                    <p className="text-xs text-white/40">
                      Invited {new Date(invite.invitedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(invite.email)}
                    disabled={revoking === invite.email}
                    className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {revoking === invite.email ? "Revoking..." : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
