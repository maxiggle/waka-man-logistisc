import Link from "next/link";

const steps = [
  {
    title: "Delivery completed",
    body: "The rider confirms the drop-off with your 4-digit code — proof the package reached the right hands.",
  },
  {
    title: "You rate the experience",
    body: "One tap, five stars, optional tags — fast, polite, careful. It takes ten seconds.",
  },
  {
    title: "The record updates",
    body: "Your rating joins the rider's public record alongside their on-time rate and delivery count.",
  },
  {
    title: "Great service rises",
    body: "Higher-rated riders get offered jobs first. Issues surface early, before they become patterns.",
  },
];

export default function RatingsPage() {
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

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Ratings</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          How ratings work
        </h1>
        <p className="mt-3 text-ink/60">
          Every delivery ends with a rating, and every rating shapes who delivers next.
        </p>

        <ol className="mt-10 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-5 rounded-2xl bg-white border border-ink/10 p-6">
              <span className="h-9 w-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                {i + 1}
              </span>
              <div>
                <h2 className="font-bold text-ink">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink/60">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link
            href="/riders"
            className="inline-block rounded-full bg-primary text-white font-semibold px-7 py-3.5 hover:bg-primary-soft transition-colors"
          >
            See the rider records
          </Link>
        </div>
      </div>
    </main>
  );
}
