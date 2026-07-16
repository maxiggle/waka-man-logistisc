"use client";

import { useRef } from "react";
import Link from "next/link";

const imageCards = [
  {
    title: "Live tracking",
    tagline: "Watch your package move on the map, minute by minute.",
    cta: "Track a delivery",
    href: "/track",
    img: "/media/features/live-tracking.jpg",
    light: false,
  },
  {
    title: "Rider records",
    tagline: "Every rider's deliveries and ratings, fully transparent.",
    cta: "Meet our riders",
    href: "/riders",
    img: "/media/features/rider-performance.jpg",
    light: false,
  },
  {
    title: "Ratings",
    tagline: "Rate every drop-off. Great service rises to the top.",
    cta: "How ratings work",
    href: "/ratings",
    img: "/media/features/client-rating.jpg",
    light: true,
  },
];

export default function FeaturesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 24 : 400;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={trackRef}
        className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Card 1 — dark card with app mockup, no image needed */}
        <article
          data-card
          className="snap-start shrink-0 w-[85%] sm:w-[420px] rounded-3xl bg-forest text-white p-8 flex flex-col overflow-hidden"
        >
          <h3 className="font-display text-2xl font-extrabold">Deliveries</h3>
          <p className="mt-3 text-white/75 leading-relaxed">
            Request a rider in seconds, delivered in minutes.
          </p>
          <Link
            href="/register?as=client"
            className="mt-6 self-start rounded-xl bg-brand text-white font-semibold px-6 py-3 hover:bg-brand-dark transition-colors"
          >
            Get started
          </Link>
          {/* Phone mockup */}
          <div className="mt-8 mx-auto w-64 rounded-t-[2rem] border-4 border-b-0 border-brand/60 bg-white text-ink p-4 pb-0">
            <div className="flex justify-between text-[10px] font-semibold text-ink/70">
              <span>9:41</span>
              <span>●●●</span>
            </div>
            <p className="mt-3 text-xs font-bold text-ink/60">Popular</p>
            {[
              ["Express", "1 min · Motorbike", "₦1,500", true],
              ["Standard", "8 min · Scooter", "₦900", false],
              ["Bulk", "12 min · Car", "₦2,400", false],
            ].map(([name, meta, price, hot]) => (
              <div
                key={name as string}
                className={`mt-2 flex items-center justify-between rounded-xl border p-3 ${
                  hot ? "border-brand" : "border-ink/10"
                }`}
              >
                <div>
                  <p className="text-sm font-bold">{name}</p>
                  <p className="text-[10px] text-ink/60">{meta}</p>
                  {hot ? (
                    <span className="mt-1 inline-block rounded bg-brand px-1.5 py-0.5 text-[8px] font-bold text-white">
                      FASTEST
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-bold">{price}</p>
              </div>
            ))}
          </div>
        </article>

        {/* Image cards */}
        {imageCards.map((c) => (
          <article
            data-card
            key={c.title}
            className="snap-start relative shrink-0 w-[85%] sm:w-[420px] min-h-[560px] rounded-3xl overflow-hidden bg-mint-soft"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.img}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className={`absolute inset-0 ${
                c.light
                  ? "bg-gradient-to-b from-cream/80 via-transparent to-transparent"
                  : "bg-gradient-to-b from-forest/70 via-forest/20 to-transparent"
              }`}
              aria-hidden
            />
            <div className="relative p-8">
              <h3
                className={`font-display text-2xl font-extrabold ${
                  c.light ? "text-forest" : "text-white"
                }`}
              >
                {c.title}
              </h3>
              <p
                className={`mt-3 max-w-[85%] leading-relaxed ${
                  c.light ? "text-ink/75" : "text-white/85"
                }`}
              >
                {c.tagline}
              </p>
              <Link
                href={c.href}
                className={`mt-6 inline-block rounded-xl font-semibold px-6 py-3 transition-colors ${
                  c.light
                    ? "bg-forest text-white hover:bg-forest-soft"
                    : "bg-mint-soft text-forest hover:bg-white"
                }`}
              >
                {c.cta}
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* Prev / next */}
      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous feature"
          className="h-11 w-11 rounded-full border border-ink/15 bg-cream text-forest hover:border-forest transition-colors"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next feature"
          className="h-11 w-11 rounded-full border border-ink/15 bg-cream text-forest hover:border-forest transition-colors"
        >
          →
        </button>
      </div>
    </div>
  );
}
