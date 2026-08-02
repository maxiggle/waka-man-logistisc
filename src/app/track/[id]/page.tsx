"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { DeliveryItem } from "@/lib/schemas";
import LiveTracking from "@/components/LiveTracking";

export default function TrackDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [delivery, setDelivery] = useState<DeliveryItem | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=/track/${id}`);
      return;
    }

    if (!isFirebaseConfigured || !db) {
      setDelivery(null);
      return;
    }

    const docRef = doc(db, "deliveries", id);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setDelivery({
            id: snapshot.id,
            ...snapshot.data(),
          } as DeliveryItem);
        } else {
          setDelivery(null);
        }
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        setDelivery(null);
      }
    );

    return () => unsubscribe();
  }, [id, user, authLoading, router]);

  // Only the client who booked this delivery or the rider it's assigned to
  // may view it — this is the app-level gate that stands in until rules
  // are deployed (see firestore.rules), and stays as defense-in-depth
  // afterward. Neither party matching is treated as "not found" rather
  // than a distinct "forbidden" state, so a guessed delivery id doesn't
  // even confirm it exists.
  const isOwner = !!delivery && !!user && (delivery.clientId === user.uid || delivery.riderId === user.uid);

  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <span className="text-sm font-semibold text-ink/50">
            Tracking <span className="text-primary">{id.toUpperCase()}</span>
          </span>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {!isFirebaseConfigured ? (
          <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm text-center">
            <h2 className="font-bold text-amber-900 text-lg">Firebase Setup Required</h2>
            <p className="mt-2 text-sm text-amber-800">
              Live tracking requires a connected Firebase Firestore database. Please add your credentials to <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env.local</code>.
            </p>
          </div>
        ) : authLoading || !user || delivery === undefined ? (
          <div className="p-12 text-center text-ink/55 animate-pulse font-medium">
            Fetching delivery status from Firestore...
          </div>
        ) : delivery === null || !isOwner ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white border border-ink/10 p-10 text-center shadow-sm">
            <p className="font-bold text-ink text-lg">Delivery not found</p>
            <p className="mt-2 text-sm text-ink/60">
              We couldn&apos;t find <span className="font-semibold">{id.toUpperCase()}</span> in Firestore.
              Check the tracking ID and try again.
            </p>
            <Link
              href="/send"
              className="mt-6 inline-block rounded-full bg-primary text-white font-semibold px-6 py-3 hover:bg-primary-soft transition-colors"
            >
              Book a new delivery
            </Link>
          </div>
        ) : (
          <LiveTracking delivery={delivery} />
        )}
      </div>
    </main>
  );
}
