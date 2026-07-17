"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getDelivery, getLocalDelivery, type Delivery } from "@/lib/demo";
import LiveTracking from "@/components/LiveTracking";

export default function TrackDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // Looked up in an effect: session-created deliveries live in sessionStorage,
  // which doesn't exist during server rendering.
  const [delivery, setDelivery] = useState<Delivery | null | undefined>(undefined);

  useEffect(() => {
    setDelivery(getDelivery(id) ?? getLocalDelivery(id) ?? null);
  }, [id]);

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
        {delivery === undefined ? null : delivery === null ? (
          <div className="mx-auto max-w-md rounded-2xl bg-white border border-ink/10 p-10 text-center">
            <p className="font-bold text-ink">Delivery not found</p>
            <p className="mt-2 text-sm text-ink/60">
              We couldn&apos;t find <span className="font-semibold">{id.toUpperCase()}</span>.
              Check the tracking number and try again.
            </p>
            <Link
              href="/track"
              className="mt-6 inline-block rounded-full bg-primary text-white font-semibold px-6 py-3 hover:bg-primary-soft transition-colors"
            >
              Track another delivery
            </Link>
          </div>
        ) : (
          <LiveTracking delivery={delivery} />
        )}
      </div>
    </main>
  );
}
