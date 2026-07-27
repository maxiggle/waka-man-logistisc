"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { auth, googleProvider, db, isFirebaseConfigured } from "@/lib/firebase";
import { isEmailInvited } from "@/lib/admin";
import { markReturningDevice } from "@/lib/session";

// Native sign-in bridge: Google blocks OAuth inside embedded WebViews, so the
// rider app opens the same Google sign-in flow in the system browser
// (/auth/native-callback) and gets handed back the raw Google credential via
// a custom-scheme deep link (see capacitor.config.ts appId + AndroidManifest).
const NATIVE_CALLBACK_SCHEME = "com.wakaman.rider://auth-callback";

export type UserRole = "client" | "rider" | "admin";

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
  const pendingNativeSignIn = useRef<{
    resolve: () => void;
    reject: (err: Error) => void;
  } | null>(null);

  // Single source of truth for reading/creating a user's Firestore profile.
  // Admin status is invite-gated (see src/lib/admin.ts): a matching
  // `adminInvites/{email}` doc promotes the user to role "admin" on this
  // sign-in, overriding whatever role the caller asked for — client code can
  // request "client" or "rider", never "admin" directly.
  const syncUserProfile = async (
    firebaseUser: User,
    requestedRole: UserRole = "client",
  ): Promise<UserProfile | null> => {
    if (!db) return null;
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    const invited = firebaseUser.email ? await isEmailInvited(firebaseUser.email) : false;

    if (!snap.exists()) {
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || "User",
        email: firebaseUser.email || "",
        photoURL: firebaseUser.photoURL || undefined,
        role: invited ? "admin" : requestedRole,
        createdAt: Date.now(),
      };
      await setDoc(userRef, newProfile);
      setUserProfile(newProfile);
      return newProfile;
    }

    const existing = snap.data() as UserProfile;
    if (invited && existing.role !== "admin") {
      const promoted: UserProfile = { ...existing, role: "admin" };
      await setDoc(userRef, { role: "admin" }, { merge: true });
      setUserProfile(promoted);
      return promoted;
    }
    setUserProfile(existing);
    return existing;
  };

  // Native (Capacitor) Google sign-in bridge: the deep link opened by
  // /auth/native-callback lands here with the raw Google credential, which we
  // exchange for a Firebase session and use to resolve the pending promise
  // that signInWithGoogle() handed back to the caller.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const urlListener = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(NATIVE_CALLBACK_SCHEME)) return;
      const pending = pendingNativeSignIn.current;
      pendingNativeSignIn.current = null;
      await Browser.close().catch(() => {});

      try {
        const params = new URL(url).searchParams;
        const error = params.get("error");
        const idToken = params.get("idToken");
        const accessToken = params.get("accessToken");
        const role = (params.get("role") as UserRole) || "client";

        if (error) throw new Error(error);
        if (!idToken || !auth) throw new Error("Google sign-in did not return a credential.");

        const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
        const result = await signInWithCredential(auth, credential);
        await syncUserProfile(result.user, role);
        pending?.resolve();
      } catch (err) {
        pending?.reject(err instanceof Error ? err : new Error("Google sign-in failed."));
      }
    });

    // If the user backs out of the system browser tab without finishing
    // sign-in, the app resumes with no deep link — clear the hung promise
    // instead of leaving the caller awaiting forever.
    const resumeListener = CapacitorApp.addListener("resume", () => {
      setTimeout(() => {
        pendingNativeSignIn.current?.reject(new Error("Sign-in was cancelled."));
        pendingNativeSignIn.current = null;
      }, 1500);
    });

    return () => {
      urlListener.then((l) => l.remove());
      resumeListener.then((l) => l.remove());
    };
  }, []);

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
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
          await syncUserProfile(firebaseUser);
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
      // Google blocks OAuth inside embedded WebViews, so hand off to the
      // system browser and wait for the appUrlOpen listener above to settle
      // this promise once the deep link callback lands.
      await Browser.open({ url: `${window.location.origin}/auth/native-callback?role=${role}` });
      return new Promise<void>((resolve, reject) => {
        pendingNativeSignIn.current = { resolve, reject };
      });
    }

    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user, role);
  };

  const signOut = async () => {
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
    return syncUserProfile(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
