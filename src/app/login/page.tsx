"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/context/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNative, setIsNative] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Capacitor.isNativePlatform() is synchronous and client-only
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  // /dashboard is a client screen — on the rider app, land on the rider's own home.
  const redirect = searchParams.get("redirect") || (isNative ? "/rider/active" : "/dashboard");
  const { signInWithGoogle, isFirebaseConfigured, loading, user } = useAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNative === null) return;
    if (user) router.replace(redirect);
  }, [isNative, user, redirect, router]);

  const handleGoogleSignIn = async () => {
    try {
      setSigningIn(true);
      setError("");
      // Native is the rider app; a new account created from here must not be a client.
      await signInWithGoogle(isNative ? "rider" : "client");
      router.push(redirect);
    } catch (err: unknown) {
      console.error("Google sign-in error:", err);
      const message = err instanceof Error ? err.message : "Failed to sign in with Google";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Welcome</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Sign in to Waka-Man</h1>

      {!isFirebaseConfigured ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="font-bold">Firebase Unconfigured</h2>
          </div>
          <p className="mt-2 text-sm text-amber-800">
            Firebase environment variables are missing. Please add your Firebase configuration to your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env.local</code> file to enable Google Authentication.
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl bg-white border border-ink/10 p-8 shadow-sm">
          <p className="text-sm text-ink/70 text-center mb-6">
            Sign in with your Google account to book riders, manage packages, and track live deliveries.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn || loading || isNative === null}
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
            {signingIn ? "Connecting Google..." : "Continue with Google"}
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-ink/55">
        By signing in, you agree to Waka-Man&apos;s Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </main>
  );
}
