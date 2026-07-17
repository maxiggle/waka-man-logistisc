import Link from "next/link";
import { riders } from "@/lib/demo";

export default function RidersPage() {
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

      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Rider records</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          Every rider, fully transparent
        </h1>
        <p className="mt-3 text-ink/60 max-w-xl">
          Deliveries completed, on-time rate, and client ratings — earned one drop-off
          at a time, visible to everyone.
        </p>

        <ol className="mt-10 space-y-3">
          {riders.map((r, i) => (
            <li
              key={r.name}
              className="flex items-center gap-4 rounded-2xl bg-white border border-ink/10 px-5 py-4"
            >
              <span className="w-6 text-sm font-bold text-ink/30 tabular-nums">{i + 1}</span>
              <span className="h-11 w-11 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-sm font-extrabold text-white">
                {r.initials}
              </span>
              <div className="flex-1">
                <p className="font-bold text-ink">{r.name}</p>
                <p className="text-xs text-ink/50">{r.deliveries.toLocaleString()} deliveries</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-accent tabular-nums">★ {r.rating.toFixed(1)}</p>
                <p className="text-xs text-ink/50 tabular-nums">{r.onTime}% on time</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl bg-primary text-white p-8 text-center">
          <h2 className="text-xl font-extrabold">Want your name on this list?</h2>
          <p className="mt-2 text-white/70 text-sm">Your record rides with you — start building it today.</p>
          <Link
            href="/register?as=rider"
            className="mt-5 inline-block rounded-full bg-accent text-ink font-semibold px-7 py-3 hover:bg-accent-soft transition-colors"
          >
            Apply as a rider
          </Link>
        </div>
      </div>
    </main>
  );
}
