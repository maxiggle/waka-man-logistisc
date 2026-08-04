"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import FeaturesCarousel from "@/components/FeaturesCarousel";
import { useAuth } from "@/context/AuthContext";
import { isReturningDevice } from "@/lib/session";
import { homeRouteForRole } from "@/lib/roles";

const features = [
  {
    n: "01",
    title: "Rider performance records",
    body: "Successful deliveries, on-time rates, and client ratings roll into one transparent score for every rider.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
        <path d="M16 7h6v6" />
      </svg>
    ),
  },
  {
    n: "02",
    title: "Live map tracking",
    body: "A real-time route line from pickup to drop-off — no more “where is my package?” calls.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    n: "03",
    title: "Verified drop-offs",
    body: "Each completed delivery is registered the moment it lands, creating an audit trail clients can trust.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    n: "04",
    title: "Client ratings",
    body: "After every delivery, clients rate the experience. Great riders rise; issues surface early.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M11.5 3.6a.55.55 0 0 1 1 0l2.2 4.4c.08.17.24.28.42.31l4.9.72c.45.06.63.62.3.94l-3.53 3.44a.55.55 0 0 0-.16.49l.83 4.87a.55.55 0 0 1-.8.58L12.28 17a.55.55 0 0 0-.51 0l-4.38 2.3a.55.55 0 0 1-.8-.57l.84-4.87a.55.55 0 0 0-.16-.5L3.73 9.98a.55.55 0 0 1 .3-.94l4.9-.72a.55.55 0 0 0 .41-.3z" />
      </svg>
    ),
  },
];

function LandingPage() {
  const router = useRouter();
  const { user, userProfile, signOut } = useAuth();

  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");

  const handleQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    const p = encodeURIComponent(pickup || "Victoria Island, Lagos");
    const d = encodeURIComponent(dropoff || "Ikeja, Lagos");

    if (user) {
      router.push(`/send?pickup=${p}&dropoff=${d}`);
    } else {
      router.push(`/login?redirect=/send?pickup=${p}&dropoff=${d}`);
    }
  };

  return (
    <main className="flex-1">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-9 w-auto" />
            <span className="leading-none">
              The Waka Man
              <span className="block text-[10px] font-bold tracking-[0.3em] uppercase text-accent">
                Logistics
              </span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/70">
            <a href="#how" className="hover:text-primary transition-colors">How it works</a>
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#riders" className="hover:text-primary transition-colors">For riders</a>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-primary hidden sm:inline-block">
                  Hi, {userProfile?.name || user.displayName || "User"}
                </span>
                <button
                  onClick={() => signOut()}
                  className="rounded-full border border-primary/20 text-primary text-xs font-semibold px-4 py-2 hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-block text-sm font-semibold text-primary hover:text-primary-soft transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:bg-primary-soft transition-colors"
                >
                  Sign in with Google
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <div className="relative">
        {/* Hero — bold purple surface, orange CTA, brand mark watermark */}
        <section className="relative z-10">
          <div className="relative min-h-[85vh] flex items-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-soft">
            {/* Brand hero video */}
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src="/media/wakaman-hero.mp4"
              autoPlay
              muted
              loop
              playsInline
            />
            {/* Readability scrim: purple wash on the copy side, fading out right */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/80 to-primary/30"
              aria-hidden
            />
            <div className="relative mx-auto max-w-6xl px-6 w-full py-16 lg:py-24">
              <div className="grid lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7">
                  <h1 className="rise rise-1 mt-6 text-4xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
                    Deliveries you can{" "}
                    <span className="text-accent">watch happen</span>.
                  </h1>
                  <p className="rise rise-2 mt-6 text-base lg:text-lg text-white/80 max-w-lg leading-relaxed">
                    The Waka Man Logistics connects trusted riders with clients — every package
                    tracked live on the map, every drop-off registered, every rider
                    rated on real performance.
                  </p>

                  <dl className="rise rise-3 mt-10 grid grid-cols-2 gap-6 max-w-md">
                    {[
                      ["98%", "on-time drop-offs"],
                      ["4.9★", "average rider rating"],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <dt className="font-display text-2xl font-extrabold text-white">{v}</dt>
                        <dd className="mt-1 text-xs text-white/60">{l}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Hero Quick-Book Form */}
                <div className="lg:col-span-5">
                  <div className="rounded-3xl bg-white/95 backdrop-blur-md p-6 lg:p-8 shadow-2xl border border-white/20">
                    <h2 className="font-extrabold text-2xl text-primary">Book a Rider</h2>
                    <p className="mt-1 text-xs text-ink/60">
                      Enter addresses to calculate fare &amp; request dispatch instantly.
                    </p>

                    <form onSubmit={handleQuickBook} className="mt-6 space-y-4">
                      <div>
                        <label htmlFor="quick-pickup" className="block text-xs font-bold uppercase tracking-wider text-ink/70">
                          Pickup Location
                        </label>
                        <input
                          id="quick-pickup"
                          type="text"
                          placeholder="e.g. 14 Adeola Odeku St, VI"
                          value={pickup}
                          onChange={(e) => setPickup(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div>
                        <label htmlFor="quick-dropoff" className="block text-xs font-bold uppercase tracking-wider text-ink/70">
                          Drop-off Location
                        </label>
                        <input
                          id="quick-dropoff"
                          type="text"
                          placeholder="e.g. 3 Allen Avenue, Ikeja"
                          value={dropoff}
                          onChange={(e) => setDropoff(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-accent text-ink font-bold py-3.5 hover:bg-accent-soft transition-colors cursor-pointer shadow-md text-base"
                      >
                        Book a Rider Now →
                      </button>
                    </form>

                    <p className="mt-4 text-center text-xs text-ink/50">
                      Secured with Google Authentication · Instant Dispatch
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Features */}
        <section id="how" className="relative z-10 bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">
                  What we do
                </p>
                <h2 className="mt-3 text-3xl lg:text-5xl font-extrabold tracking-tight text-primary">
                  Request. Track. Deliver. Rate.
                </h2>
              </div>
              <p className="text-ink/60 max-w-sm leading-relaxed">
                Everything the platform does today — from the moment you request
                a rider to the rating you leave at the door.
              </p>
            </div>
            <div className="mt-12">
              <FeaturesCarousel />
            </div>
          </div>
        </section>

        {/* Features list */}
        <section id="features" className="relative z-10 bg-surface-deep">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:py-28 grid lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20">
            <div className="lg:sticky lg:top-28 self-start">
              <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">
                Why Waka Man
              </p>
              <h2 className="mt-3 text-3xl lg:text-5xl font-extrabold tracking-tight text-primary text-balance">
                Built on trust, measured in deliveries
              </h2>
              <p className="mt-5 text-ink/65 leading-relaxed max-w-md">
                Every successful delivery strengthens a rider&apos;s record. Every
                rating sharpens the picture. Nothing is hidden — from you or
                from us.
              </p>
            </div>
            <ul className="divide-y divide-ink/10">
              {features.map((f) => (
                <li key={f.title} className="group flex gap-6 py-8 first:pt-0 last:pb-0">
                  <span className="font-display text-sm font-bold text-ink/30 pt-1 tabular-nums">
                    {f.n}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-accent" aria-hidden>{f.icon}</span>
                      <h3 className="font-display text-lg font-bold text-primary">
                        {f.title}
                      </h3>
                    </div>
                    <p className="mt-2.5 leading-relaxed text-ink/60 max-w-lg">
                      {f.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Rider CTA */}
        <section id="riders" className="relative z-10">
          <div className="relative overflow-hidden bg-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/features/rider-performance.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top opacity-60"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-primary/30"
              aria-hidden
            />
            <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
              <div className="max-w-xl">
                <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent-tint">
                  For riders
                </p>
                <h2 className="mt-3 text-3xl lg:text-5xl font-extrabold tracking-tight text-white text-balance">
                  Ride with us. Your record rides with you.
                </h2>
                <p className="mt-5 text-white/75 leading-relaxed max-w-md">
                  Build a verified performance history — completed deliveries,
                  punctuality, and client ratings — that grows your earnings and
                  your reputation.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/register?as=rider"
                    className="rounded-full bg-accent text-ink font-semibold px-8 py-4 hover:bg-accent-soft transition-colors cursor-pointer"
                  >
                    Apply as a rider
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-surface border-t border-ink/8">
        <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <span className="flex items-center gap-2.5 font-display text-lg font-extrabold text-primary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
              The Waka Man Logistics
            </span>
            <p className="mt-4 text-sm leading-relaxed text-ink/55 max-w-xs">
              Trusted riders, live-tracked deliveries, and transparent records —
              across Lagos, on time, every time.
            </p>
          </div>
          <nav aria-label="Platform">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">
              Platform
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ["Track a delivery", "/track"],
                ["Send a package", "/send"],
                ["Become a rider", "/register?as=rider"],
                ["Sign in", "/login"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-ink/60 hover:text-primary transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-ink/40">
              Company
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ["How it works", "#how"],
                ["Features", "#features"],
                ["For riders", "#riders"],
              ].map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-ink/60 hover:text-primary transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-t border-ink/8">
          <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink/45">
            <p>© {new Date().getFullYear()} The Waka Man Logistics. All rights reserved.</p>
            <p className="font-semibold tracking-widest uppercase text-accent">
              on time. every time.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Splash() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-deep">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </main>
  );
}

// Root route gate. Native (Capacitor) is the rider app, not a marketing
// surface, so the landing page must never appear there — see it straight to
// Google sign-in / the rider's own home instead. For the web/PWA, only a
// device that has never completed a sign-in gets the marketing landing
// page; every returning device skips straight to its dashboard (if the
// session is still live) or to /login (if the session has expired or been
// signed out). See src/lib/session.ts for how "returning" is tracked.
export default function Home() {
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const [returning, setReturning] = useState<boolean | null>(null);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    setReturning(isReturningDevice());
  }, []);

  useEffect(() => {
    if (isNative === null || returning === null || loading) return;

    // Native is the rider app, not a marketing surface — the landing page must
    // never appear there. Signed-in users go to their own home; everyone else
    // goes straight to Google sign-in.
    //
    // /register?as=rider rather than /login on purpose: login hardcodes
    // signInWithGoogle("client"), which would create client accounts for new
    // riders, and register is also where the rider's vehicle is captured —
    // without it they only qualify for "standard" jobs (VEHICLE_ELIGIBILITY).
    if (isNative) {
      router.replace(user ? homeRouteForRole(userProfile?.role) : "/register?as=rider");
      return;
    }

    // Web: first-time devices keep the landing page; returning devices skip it.
    if (!returning) return;
    router.replace(user ? homeRouteForRole(userProfile?.role) : "/login");
  }, [isNative, returning, loading, user, userProfile, router]);

  // Still resolving device/session state — show the splash rather than flashing
  // the landing page at someone who is about to be redirected away from it.
  if (isNative === null || returning === null) return <Splash />;
  if (isNative) return <Splash />;
  if (!returning) return <LandingPage />;
  return <Splash />;
}
