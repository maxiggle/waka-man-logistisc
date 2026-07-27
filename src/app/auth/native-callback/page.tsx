"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";

// Opened in the system browser (Chrome Custom Tabs) by the Capacitor rider
// app — Google refuses OAuth inside its embedded WebView, so this page runs
// the real signInWithPopup flow here, then hands the raw Google credential
// back to the app via a custom-scheme deep link. See AuthContext.tsx.
const NATIVE_CALLBACK_SCHEME = "com.wakaman.rider://auth-callback";

function NativeCallback() {
  const params = useSearchParams();
  const role = params.get("role") || "client";
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("Opening Google sign-in...");

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setStatus("error");
      setMessage("Firebase is not configured for this app.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.idToken) {
          throw new Error("Google did not return a credential.");
        }
        if (cancelled) return;
        const redirect = new URL(NATIVE_CALLBACK_SCHEME);
        redirect.searchParams.set("role", role);
        redirect.searchParams.set("idToken", credential.idToken);
        if (credential.accessToken) redirect.searchParams.set("accessToken", credential.accessToken);
        window.location.href = redirect.toString();
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : "Google sign-in failed.";
        setStatus("error");
        setMessage(reason);
        const redirect = new URL(NATIVE_CALLBACK_SCHEME);
        redirect.searchParams.set("error", reason);
        window.location.href = redirect.toString();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <main className="min-h-screen bg-surface-deep flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        {status === "working" ? (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        ) : (
          <div className="mx-auto mb-4 h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">!</div>
        )}
        <p className="font-semibold text-ink">{message}</p>
        <p className="mt-2 text-sm text-ink/50">
          {status === "working"
            ? "Returning you to Waka-Man Rider..."
            : "Returning you to Waka-Man Rider — you can close this tab if it doesn't happen automatically."}
        </p>
      </div>
    </main>
  );
}

export default function NativeCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-deep" />}>
      <NativeCallback />
    </Suspense>
  );
}
