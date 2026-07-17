import Link from "next/link";

const actions = [
  {
    href: "/send",
    title: "Send a package",
    body: "Set pickup and drop-off, pick a vehicle, and watch your rider move.",
    primary: true,
  },
  {
    href: "/track",
    title: "Track a delivery",
    body: "Enter a tracking number or open one of your active deliveries.",
    primary: false,
  },
  {
    href: "/admin",
    title: "Admin dispatch",
    body: "The owner's view — live fleet map, all deliveries, rider records.",
    primary: false,
  },
];

export default function DashboardPage() {
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
            Sign out
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">Signed in · demo</p>
        <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
          What would you like to do?
        </h1>

        <div className="mt-10 space-y-4">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`block rounded-2xl p-6 transition-colors cursor-pointer ${
                a.primary
                  ? "bg-primary text-white hover:bg-primary-soft"
                  : "bg-white border border-ink/10 hover:border-accent/50"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`font-bold text-lg ${a.primary ? "text-white" : "text-primary"}`}>
                    {a.title}
                  </p>
                  <p className={`mt-1 text-sm ${a.primary ? "text-white/70" : "text-ink/55"}`}>
                    {a.body}
                  </p>
                </div>
                <span className={`text-xl ${a.primary ? "text-accent-tint" : "text-ink/30"}`} aria-hidden>
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
