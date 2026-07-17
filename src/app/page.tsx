import Link from "next/link";
import MapRoute from "@/components/MapRoute";
import FeaturesCarousel from "@/components/FeaturesCarousel";

const features = [
  {
    title: "Rider performance records",
    body: "Successful deliveries, on-time rates, and client ratings roll into one transparent score for every rider.",
    icon: "🏍️",
  },
  {
    title: "Live map tracking",
    body: "A real-time route line from pickup to drop-off — no more “where is my package?” calls.",
    icon: "📍",
  },
  {
    title: "Verified drop-offs",
    body: "Each completed delivery is registered the moment it lands, creating an audit trail clients can trust.",
    icon: "✅",
  },
  {
    title: "Client ratings",
    body: "After every delivery, clients rate the experience. Great riders rise; issues surface early.",
    icon: "⭐",
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

      {/* Map canvas: everything below scrolls over a street map,
          with the route line drawing itself between sections */}
      <div id="map-page" className="relative map-canvas">
        <div className="absolute inset-0 map-parks" aria-hidden />
        <MapRoute />

        {/* Hero — bold purple surface, orange CTA, brand mark watermark */}
        <section className="relative z-10">
          <div
            data-route-stop
            className="relative min-h-[85vh] flex items-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-soft"
          >
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

        {/* Our Features — Bolt-style horizontal card carousel */}
        <section id="how" className="relative z-10 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div data-route-stop className="rounded-[2.5rem] bg-surface/90 backdrop-blur-sm p-8 lg:p-10 shadow-xl shadow-primary/10">
              <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
                Our Features
              </h2>
              <p className="mt-4 text-ink/60 max-w-xl">
                Everything the platform does today — request, track, deliver, rate.
              </p>
              <div className="mt-10">
                <FeaturesCarousel />
              </div>
            </div>
          </div>
        </section>

        {/* Features — card on the right, route swings left */}
        <section id="features" className="relative z-10 py-24">
          <div className="mx-auto max-w-6xl px-6 flex lg:justify-end">
            <div
              data-route-stop
              className="lg:max-w-[62%] rounded-[2.5rem] bg-surface/90 backdrop-blur-sm p-10 shadow-xl shadow-primary/10"
            >
              <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
                Built on trust, measured in deliveries
              </h2>
              <p className="mt-4 text-ink/65 leading-relaxed max-w-xl">
                Every successful delivery strengthens a rider&apos;s record. Every
                rating sharpens the picture.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-5">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-3xl border border-ink/8 bg-white/70 p-6 hover:border-accent/40 transition-colors"
                  >
                    <span className="text-2xl" aria-hidden>{f.icon}</span>
                    <h3 className="mt-3 font-bold text-primary">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink/60">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Rider CTA — destination card, route swings right then ends */}
        <section id="riders" className="relative z-10 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div
              data-route-stop
              className="lg:max-w-[62%] rounded-[2.5rem] bg-primary text-white px-8 py-14 lg:px-14 relative overflow-hidden shadow-2xl shadow-primary/30"
            >
              <div
                className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-2xl"
                aria-hidden
              />
              <div className="relative">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 text-white/90 text-xs font-semibold tracking-wide uppercase px-4 py-2">
                  📍 Destination reached
                </p>
                <h2 className="mt-5 text-3xl lg:text-4xl font-extrabold tracking-tight">
                  Ride with us. Your record rides with you.
                </h2>
                <p className="mt-4 text-white/70 leading-relaxed">
                  Build a verified performance history — completed deliveries,
                  punctuality, and client ratings — that grows your earnings and
                  your reputation.
                </p>
                <Link
                  href="/register?as=rider"
                  className="mt-8 inline-block rounded-full bg-accent text-ink font-semibold px-8 py-4 hover:bg-accent-soft transition-colors shadow-lg shadow-black/20"
                >
                  Apply as a rider
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-ink/8 py-10 bg-surface">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink/50">
          <span className="flex items-center gap-2 font-display font-bold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-7 w-auto" />
            The Waka Man Logistics
            <span className="hidden sm:inline text-xs font-semibold tracking-widest text-accent">
              on time. every time...
            </span>
          </span>
          <p>© {new Date().getFullYear()} The Waka Man Logistics. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
