"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth, googleProvider, db, isFirebaseConfigured } from "@/lib/firebase";
import { isEmailInvited } from "@/lib/admin";
import { isEmailSuperAdminInvited } from "@/lib/superadmin";
import { markReturningDevice } from "@/lib/session";

// The native Google Sign-In sheet rejects when the user dismisses it. On Android
// that arrives as ApiException status 12501; the plugin's wording varies across
// platforms, so match defensively rather than on one exact string.
function normalizeSignInError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/12501|cancell?ed|canceled|closed by user/i.test(raw)) {
    return new Error("Sign-in was cancelled.");
  }
  return new Error(raw || "Google sign-in failed.");
}

export type UserRole = "client" | "rider" | "admin" | "superadmin";

/**
 * Resolves which invite-gated role (if any) this email currently holds.
 * Checked superadmin-first: if an email somehow has both invites, superadmin
 * wins — see the KNOWN LIMITATION note in src/lib/superadmin.ts for why a
 * user can't hold both roles at once under the current single-role schema.
 */
async function resolveInvitedRole(email: string | null): Promise<"superadmin" | "admin" | null> {
  if (!email) return null;
  if (await isEmailSuperAdminInvited(email)) return "superadmin";
  if (await isEmailInvited(email)) return "admin";
  return null;
}

/**
 * Two-way role reconciliation (WM-105) — the actual fix, not just the
 * promote half that shipped originally. `existing.role` was previously only
 * ever moved *toward* an invited role, never away from one: an admin or
 * superadmin whose invite had been deleted kept that role forever, because
 * `if (invitedRole && …)` simply does nothing when `invitedRole` is null.
 * Deleting an adminInvites/superadminInvites doc looked like it revoked
 * access; it didn't touch the user's stored role at all.
 *
 * The rule now runs in both directions: an invite promotes, and the absence
 * of one demotes — but only for a role that is itself invite-gated
 * (admin/superadmin). "rider" and "client" are never touched here; there's
 * no invite mechanism for them to be reconciled against.
 *
 * Demotes to "client", not the requested role at signup time — a demoted
 * admin was never a rider, so there's no other role to fall back to.
 */
function reconcileRole(currentRole: UserRole, invitedRole: "superadmin" | "admin" | null): UserRole {
  if (invitedRole) return invitedRole;
  if (currentRole === "admin" || currentRole === "superadmin") return "client";
  return currentRole;
}

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  createdAt: number;
};

type AuthContextType = {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isFirebaseConfigured: boolean;
  signInWithGoogle: (role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  isFirebaseConfigured: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshUserProfile: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Read-only profile load. Deliberately does NOT create a missing document:
  // only the sign-in path knows which role the user asked for, and having this
  // create one too meant whichever of the two finished first decided the role —
  // a rider registration could silently end up as role "client".
  const loadUserProfile = async (firebaseUser: User): Promise<UserProfile | null> => {
    if (!db) return null;
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      setUserProfile(null);
      return null;
    }

    const existing = snap.data() as UserProfile;
    const invitedRole = await resolveInvitedRole(firebaseUser.email);
    const nextRole = reconcileRole(existing.role, invitedRole);
    if (nextRole !== existing.role) {
      const reconciled: UserProfile = { ...existing, role: nextRole };
      await setDoc(userRef, { role: nextRole }, { merge: true });
      setUserProfile(reconciled);
      return reconciled;
    }

    setUserProfile(existing);
    return existing;
  };

  // Single source of truth for reading/creating a user's Firestore profile.
  // Admin/superadmin status is invite-gated (src/lib/admin.ts,
  // src/lib/superadmin.ts): a matching `adminInvites/{email}` or
  // `superadminInvites/{email}` doc promotes the user to that role on this
  // sign-in, overriding whatever role the caller asked for — client code can
  // request "client" or "rider", never "admin"/"superadmin" directly. The
  // reverse also holds now (WM-105): if the caller's stored role is
  // invite-gated and no matching invite exists, this demotes them.
  const syncUserProfile = async (
    firebaseUser: User,
    requestedRole: UserRole = "client",
  ): Promise<UserProfile | null> => {
    if (!db) return null;
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    const invitedRole = await resolveInvitedRole(firebaseUser.email);

    if (!snap.exists()) {
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || "User",
        email: firebaseUser.email || "",
        photoURL: firebaseUser.photoURL || undefined,
        role: invitedRole || requestedRole,
        createdAt: Date.now(),
      };
      await setDoc(userRef, newProfile);
      setUserProfile(newProfile);
      return newProfile;
    }

    const existing = snap.data() as UserProfile;
    const nextRole = reconcileRole(existing.role, invitedRole);
    if (nextRole !== existing.role) {
      const reconciled: UserProfile = { ...existing, role: nextRole };
      await setDoc(userRef, { role: nextRole }, { merge: true });
      setUserProfile(reconciled);
      return reconciled;
    }
    setUserProfile(existing);
    return existing;
  };

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Stop loading if auth is unavailable
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser && db) {
        // Once a device has completed any sign-in, it's never "first-time"
        // again — even after a later sign-out — so the landing page won't
        // show for it anymore. See src/lib/session.ts.
        markReturningDevice();
        try {
          await loadUserProfile(firebaseUser);
        } catch (err) {
          console.error("Failed to sync user profile with Firestore:", err);
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (role: UserRole = "client") => {
    if (!auth || !isFirebaseConfigured) {
      throw new Error("Firebase Auth is not configured. Please add NEXT_PUBLIC_FIREBASE_* environment variables.");
    }

    if (Capacitor.isNativePlatform()) {
      // Native Google account picker via Play Services — no browser tab, and no
      // OAuth redirect, so Firebase's authorized-domain list doesn't apply. That's
      // what lets this work against a LAN dev server as well as the deployed URL.
      let result;
      try {
        result = await FirebaseAuthentication.signInWithGoogle();
      } catch (err) {
        // Log the raw error before normalizing — the exact Android message is
        // worth knowing when refining the match above.
        console.error("Native Google sign-in failed:", err);
        throw normalizeSignInError(err);
      }
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error("Google sign-in did not return a credential.");

      const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
      const nativeResult = await signInWithCredential(auth, credential);
      await syncUserProfile(nativeResult.user, role);
      return;
    }

    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user, role);
  };

  const signOut = async () => {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => {});
    }
    if (auth) {
      await firebaseSignOut(auth);
      setUser(null);
      setUserProfile(null);
    }
  };

  // Re-runs the invite/promotion check for the current session without
  // requiring a full reload — onAuthStateChanged only fires on actual
  // sign-in/out events, so an admin invite added while a user is already
  // signed in wouldn't otherwise be picked up until their next fresh login.
  // Memoized so its identity only changes with `user`, safe to depend on
  // from a page's own useEffect without re-triggering on every render.
  const refreshUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user) return null;
    return loadUserProfile(user);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isFirebaseConfigured,
        signInWithGoogle,
        signOut,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
