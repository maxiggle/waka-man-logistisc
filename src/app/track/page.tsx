"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TrackPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = code.trim();
    if (!id) {
      setError("Please enter a valid tracking number or delivery ID.");
      return;
    }
    router.push(`/track/${id}`);
  };

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

      <div className="mx-auto max-w-xl px-6 py-20">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Track a delivery</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          Where is my package?
        </h1>
        <p className="mt-3 text-ink/60">
          Enter the tracking number or delivery ID from your order confirmation.
        </p>

        <form onSubmit={submit} className="mt-8">
          <label htmlFor="tracking" className="sr-only">Tracking number</label>
          <div className="flex gap-3">
            <input
              id="tracking"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              placeholder="e.g. delivery document ID"
              autoComplete="off"
              className="flex-1 rounded-xl border border-ink/15 bg-white px-5 py-4 font-semibold tracking-wide text-ink placeholder:text-ink/30 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              className="rounded-xl bg-primary text-white font-semibold px-7 hover:bg-primary-soft transition-colors cursor-pointer"
            >
              Track
            </button>
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        </form>

        <div className="mt-10 rounded-2xl border border-ink/10 bg-white p-6 text-center">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Need to send a package?</p>
          <p className="mt-2 text-sm text-ink/60">Book a rider to get real-time GPS tracking for your delivery.</p>
          <Link
            href="/send"
            className="mt-4 inline-block rounded-xl bg-accent text-ink font-bold px-6 py-3 hover:bg-accent-soft transition-colors"
          >
            Book a Rider Now
          </Link>
        </div>
      </div>
    </main>
  );
}
