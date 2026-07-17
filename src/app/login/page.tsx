"use client";

import { useState } from "react";
import Link from "next/link";
import OtpForm from "@/components/OtpForm";

export default function LoginPage() {
  const [sent, setSent] = useState(false);

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

      <div className="mx-auto max-w-md px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Welcome back</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-primary">Sign in</h1>

        {sent ? (
          <OtpForm />
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <div>
              <label htmlFor="phone" className="text-sm font-semibold text-ink/70">Phone number</label>
              <input
                id="phone"
                type="tel"
                required
                placeholder="0801 234 5678"
                className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 placeholder:text-ink/30 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-primary text-white font-semibold py-3.5 hover:bg-primary-soft transition-colors cursor-pointer"
            >
              Send sign-in code
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink/55">
          New here?{" "}
          <Link href="/register" className="font-semibold text-primary hover:text-primary-soft">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
