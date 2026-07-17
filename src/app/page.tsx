import Link from "next/link";
import FeaturesCarousel from "@/components/FeaturesCarousel";

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

export default function Home() {
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
            <Link
              href="/login"
              className="hidden sm:inline-block text-sm font-semibold text-primary hover:text-primary-soft transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:bg-primary-soft transition-colors"
            >
              Get started
            </Link>
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
              className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/60 to-primary/20"
              aria-hidden
            />
            <div className="relative mx-auto max-w-6xl px-6 w-full py-24">
              <div className="max-w-2xl">
                <p className="rise inline-flex items-center gap-2 rounded-full bg-white/10 text-white/90 text-xs font-semibold tracking-wide uppercase px-4 py-2">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  Live delivery tracking
                </p>
                <h1 className="rise rise-1 mt-6 text-5xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.02]">
                  Deliveries you can{" "}
                  <span className="text-accent">watch happen</span>.
                </h1>
                <p className="rise rise-2 mt-6 text-lg text-white/75 max-w-md leading-relaxed">
                  The Waka Man Logistics connects trusted riders with clients — every package
                  tracked live on the map, every drop-off registered, every rider
                  rated on real performance.
                </p>
                <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    href="/register?as=client"
                    className="rounded-full bg-accent text-ink font-semibold px-7 py-3.5 shadow-lg shadow-black/25 hover:bg-accent-soft transition-colors"
                  >
                    Send a package
                  </Link>
                  <Link
                    href="/register?as=rider"
                    className="rounded-full border-2 border-white/30 text-white font-semibold px-7 py-3.5 hover:border-white hover:bg-white hover:text-primary transition-colors"
                  >
                    Become a rider
                  </Link>
                </div>
                <dl className="rise rise-3 mt-12 grid grid-cols-3 gap-6 max-w-md">
                  {[
                    ["98%", "on-time drop-offs"],
                    ["4.9★", "average rider rating"],
                    ["Live", "GPS route tracking"],
                  ].map(([v, l]) => (
                    <div key={l}>
                      <dt className="font-display text-2xl font-extrabold text-white">{v}</dt>
                      <dd className="mt-1 text-xs text-white/60">{l}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Our Features — full-width surface, editorial header + carousel */}
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

        {/* Features — editorial split: sticky heading left, numbered rows right */}
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

        {/* Rider CTA — full-bleed brand photography with scrim */}
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
                  <Link
                    href="/riders"
                    className="font-semibold text-white/80 hover:text-white transition-colors cursor-pointer"
                  >
                    See rider records →
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
                ["Send a package", "/register?as=client"],
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
