"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { AVAILABLE_TRANSPORT_MODES, type RiderVehicle } from "@/lib/dispatchConfig";
import { requestAppAccess } from "@/lib/riderAccess";

/**
 * signInWithGoogle() can resolve slightly before the SDK's currentUser is
 * populated (observed on the native deep-link path in particular), so poll
 * via onAuthStateChanged instead of assuming auth.currentUser is already set.
 */
function waitForCurrentUser(authInstance: Auth, timeoutMs = 5000): Promise<User> {
  if (authInstance.currentUser) return Promise.resolve(authInstance.currentUser);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Sign-in did not complete in time. Please try again."));
    }, timeoutMs);
    const unsubscribe = onAuthStateChanged(authInstance, (u) => {
      if (u) {
        clearTimeout(timer);
        unsubscribe();
        resolve(u);
      }
    });
  });
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [isNative, setIsNative] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Capacitor.isNativePlatform() is synchronous and client-only
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  const [roleChoice, setRoleChoice] = useState<UserRole>(params.get("as") === "rider" ? "rider" : "client");
  // Native is the rider app — the role is not the user's to choose there.
  const role: UserRole = isNative ? "rider" : roleChoice;
  const [vehicle, setVehicle] = useState<RiderVehicle | "">(
    AVAILABLE_TRANSPORT_MODES.length === 1 ? AVAILABLE_TRANSPORT_MODES[0].id : "",
  );
  const { signInWithGoogle, isFirebaseConfigured, loading, user } = useAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  // Suppresses the auto-redirect effect below while a registration write is
  // in flight (or failed) — `user` can go non-null mid-write, and the effect
  // must not navigate away before the vehicle write has succeeded.
  const registeringRef = useRef(false);

  useEffect(() => {
    if (registeringRef.current || requestSent) return;
    if (user) router.replace(role === "rider" ? "/rider/active" : "/send");
  }, [user, role, router, requestSent]);

  const handleGoogleSignUp = async () => {
    if (role === "rider" && !vehicle) {
      setError("Select a vehicle type to register as a rider.");
      return;
    }
    registeringRef.current = true;
    try {
      setSigningIn(true);
      setError("");
      await signInWithGoogle(role);

      if (role === "rider" && vehicle) {
        if (!db || !auth) throw new Error("Firebase is not configured.");
        const currentUser = await waitForCurrentUser(auth);
        await setDoc(doc(db, "users", currentUser.uid), { vehicle }, { merge: true });
        
        await requestAppAccess();
        if (!isNative) {
          setRequestSent(true);
          registeringRef.current = false;
          return; // Don't redirect, show confirmation
        }
      }

      // Only clear the guard on success — on failure it stays suppressed so
      // the rider isn't navigated away from the error they need to retry.
      registeringRef.current = false;
      router.push(role === "rider" ? "/rider/active" : "/send");
    } catch (err: unknown) {
      console.error("Google sign-up error:", err);
      const message = err instanceof Error ? err.message : "Failed to register with Google";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Get started</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">
        {role === "rider" ? "Register as a Waka-Man Rider" : "Create Waka-Man Account"}
      </h1>

      {!isNative && (
        <div className="mt-6 grid grid-cols-2 rounded-xl border border-ink/15 bg-white p-1 text-sm font-semibold">
          {(["client", "rider"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleChoice(r)}
              className={`rounded-lg py-2.5 transition-colors cursor-pointer ${
                role === r ? "bg-primary text-white" : "text-ink/55 hover:text-primary"
              }`}
            >
              {r === "client" ? "I send packages" : "I deliver packages"}
            </button>
          ))}
        </div>
      )}

      {role === "rider" && (
        <div className="mt-6">
          {AVAILABLE_TRANSPORT_MODES.length === 1 ? (
            <p className="text-sm font-semibold text-ink/70">
              Riding: <span className="text-primary">{AVAILABLE_TRANSPORT_MODES[0].label}</span>
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-ink/70">What do you ride?</p>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_TRANSPORT_MODES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVehicle(opt.id)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                      vehicle === opt.id
                        ? "border-primary bg-primary text-white"
                        : "border-ink/15 bg-white text-ink/70 hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!isFirebaseConfigured ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="font-bold">Firebase Setup Required</h2>
          </div>
          <p className="mt-2 text-sm text-amber-800">
            Please configure your Firebase credentials in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env.local</code> to enable Google Registration.
          </p>
        </div>
      ) : requestSent ? (
        <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-8 shadow-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 mb-4">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">Request Sent</h2>
          <p className="text-sm text-ink/70">
            We&apos;ll review your application and email you when approved. You can close this window.
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-8 shadow-sm">
          <p className="text-sm text-ink/70 text-center mb-6">
            Register securely in one click using your Google account.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={signingIn || loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-ink/15 bg-white px-6 py-3.5 font-semibold text-ink hover:bg-surface transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            {signingIn
              ? "Connecting Google..."
              : role === "rider" && !isNative
              ? "Request app access"
              : "Register with Google"}
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink/55">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-soft">Sign in</Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <Link href="/" className="text-sm font-semibold text-ink/60 hover:text-primary transition-colors">
            ← Back home
          </Link>
        </nav>
      </header>

      <Suspense fallback={<div className="p-8 text-center text-ink/60">Loading...</div>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
