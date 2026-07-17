"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deliveries } from "@/lib/demo";

export default function TrackPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = code.trim().toUpperCase();
    if (!deliveries.some((d) => d.id === id)) {
      setError("No delivery found with that number. Try one of the demo codes below.");
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
          Enter the tracking number from your confirmation message.
        </p>

        <form onSubmit={submit} className="mt-8">
          <label htmlFor="tracking" className="sr-only">Tracking number</label>
          <div className="flex gap-3">
            <input
              id="tracking"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              placeholder="e.g. WM-2481"
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

        <div className="mt-10 rounded-2xl border border-ink/10 bg-white p-6">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">Demo deliveries</p>
          <ul className="mt-4 space-y-3">
            {deliveries.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/track/${d.id}`}
                  className="flex items-center justify-between rounded-xl border border-ink/10 px-4 py-3 hover:border-accent/50 transition-colors cursor-pointer"
                >
                  <span className="font-bold text-primary tracking-wide">{d.id}</span>
                  <span className="text-sm text-ink/55">
                    {d.status === "in_transit" && "In transit — watch it move"}
                    {d.status === "assigned" && "Rider heading to pickup"}
                    {d.status === "delivered" && "Delivered — see proof"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
