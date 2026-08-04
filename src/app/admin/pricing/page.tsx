"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import { fetchPricingConfig, fetchPricingHistory, savePricingConfig } from "@/lib/pricingAdmin";
import { computeFareKobo } from "@/lib/pricingFormula";
import { formatNaira } from "@/lib/money";
import type { PricingConfigInput, PricingHistoryEntry } from "@/lib/schemas";
import type { ServiceLevel } from "@/lib/dispatchConfig";

const PREVIEW_DISTANCES_KM = [2, 5, 10, 20, 30];
const TIERS: { key: ServiceLevel; label: string }[] = [
  { key: "express", label: "Express" },
  { key: "standard", label: "Standard" },
  { key: "bulk", label: "Bulk" },
];

/** All form fields as plain strings — lets the input go through invalid/empty intermediate states while typing without fighting the input's cursor. */
type TierFormFields = { baseNaira: string; perKmNaira: string; minimumNaira: string };
type FormState = {
  express: TierFormFields;
  standard: TierFormFields;
  bulk: TierFormFields;
  roundingNaira: string;
  detourFactor: string;
  maxTripKm: string;
};

function toFormState(input: PricingConfigInput): FormState {
  const tier = (t: PricingConfigInput["express"]): TierFormFields => ({
    baseNaira: String(t.baseNaira),
    perKmNaira: String(t.perKmNaira),
    minimumNaira: String(t.minimumNaira),
  });
  return {
    express: tier(input.express),
    standard: tier(input.standard),
    bulk: tier(input.bulk),
    roundingNaira: String(input.roundingNaira),
    detourFactor: String(input.detourFactor),
    maxTripKm: String(input.maxTripKm),
  };
}

/** Parses the form into a submittable/previewable PricingConfigInput, or null if anything isn't a valid positive number yet. */
function parseForm(form: FormState): PricingConfigInput | null {
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const tier = (t: TierFormFields) => ({
    baseNaira: num(t.baseNaira),
    perKmNaira: num(t.perKmNaira),
    minimumNaira: num(t.minimumNaira),
  });
  const parsed: PricingConfigInput = {
    express: tier(form.express),
    standard: tier(form.standard),
    bulk: tier(form.bulk),
    roundingNaira: num(form.roundingNaira),
    detourFactor: num(form.detourFactor),
    maxTripKm: Math.round(num(form.maxTripKm)),
  };
  const values = [
    ...Object.values(parsed.express),
    ...Object.values(parsed.standard),
    ...Object.values(parsed.bulk),
    parsed.roundingNaira,
    parsed.detourFactor,
    parsed.maxTripKm,
  ];
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return parsed;
}

function tierField(
  form: FormState,
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>,
  tierKey: "express" | "standard" | "bulk",
  field: keyof TierFormFields,
  label: string,
) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-white/50">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={form[tierKey][field]}
        onChange={(e) =>
          setForm((prev) => (prev ? { ...prev, [tierKey]: { ...prev[tierKey], [field]: e.target.value } } : prev))
        }
        className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
      />
    </label>
  );
}

function summarizeChange(entry: PricingHistoryEntry): string {
  if (!entry.before) return "Initial pricing seeded";
  const lines: string[] = [];
  for (const tier of TIERS) {
    const before = entry.before[tier.key];
    const after = entry.after[tier.key];
    if (before.baseKobo !== after.baseKobo || before.perKmKobo !== after.perKmKobo || before.minimumKobo !== after.minimumKobo) {
      lines.push(
        `${tier.label}: base ${formatNaira(before.baseKobo)}→${formatNaira(after.baseKobo)}, ` +
          `per-km ${formatNaira(before.perKmKobo)}→${formatNaira(after.perKmKobo)}, ` +
          `min ${formatNaira(before.minimumKobo)}→${formatNaira(after.minimumKobo)}`,
      );
    }
  }
  if (entry.before.roundingKobo !== entry.after.roundingKobo) {
    lines.push(`Rounding ${formatNaira(entry.before.roundingKobo)}→${formatNaira(entry.after.roundingKobo)}`);
  }
  if (entry.before.detourFactor !== entry.after.detourFactor) {
    lines.push(`Detour factor ${entry.before.detourFactor}→${entry.after.detourFactor}`);
  }
  if (entry.before.maxTripKm !== entry.after.maxTripKm) {
    lines.push(`Max trip ${entry.before.maxTripKm}km→${entry.after.maxTripKm}km`);
  }
  return lines.length > 0 ? lines.join("; ") : "No effective change";
}

export default function AdminPricingPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUserProfile } = useAuth();

  const [checkingRole, setCheckingRole] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedUpdatedAt, setSavedUpdatedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [history, setHistory] = useState<(PricingHistoryEntry & { id: string })[]>([]);

  // Re-check role on every visit — same reasoning as admin/areas: a
  // superadmin invite added while already signed in doesn't retroactively
  // fire onAuthStateChanged.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/admin/pricing");
      return;
    }
    let cancelled = false;
    (async () => {
      const profile = await refreshUserProfile();
      if (cancelled) return;
      const superadmin = profile?.role === "superadmin";
      setIsSuperAdmin(superadmin);
      setCheckingRole(false);
      if (!superadmin) router.replace("/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router, refreshUserProfile]);

  useEffect(() => {
    if (authLoading || checkingRole || !user || !isSuperAdmin) return;

    async function load() {
      if (!isFirebaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const [config, historyEntries] = await Promise.all([fetchPricingConfig(), fetchPricingHistory()]);
        setForm(toFormState(config.current ?? config.seed));
        setSavedUpdatedAt(config.updatedAt);
        setHistory(historyEntries);
      } catch (err) {
        console.error("Failed to load pricing config:", err);
        setError(err instanceof Error ? err.message : "Failed to load pricing config.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, checkingRole, user, isSuperAdmin]);

  const parsed = useMemo(() => (form ? parseForm(form) : null), [form]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) {
      setError("Every field needs a positive number before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const result = await savePricingConfig(parsed);
      setSavedUpdatedAt(result.updatedAt);
      setSaveMessage("Saved — new quotes reflect this immediately.");
      setHistory(await fetchPricingHistory());
    } catch (err) {
      console.error("Failed to save pricing config:", err);
      setError(err instanceof Error ? err.message : "Failed to save pricing config.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || checkingRole || !user || !isSuperAdmin) {
    return (
      <main className="min-h-screen bg-[#141019] flex items-center justify-center">
        <p className="text-sm text-white/40 animate-pulse">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#141019] text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-extrabold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark-white.png" alt="" className="h-8 w-auto" />
            <span>
              waka man
              <span className="block text-[9px] font-bold tracking-[0.3em] uppercase text-accent">Pricing</span>
            </span>
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold text-white/60 hover:text-white transition-colors">
            ← Back to dashboard
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">Distance pricing</p>
        <h1 className="mt-1 text-2xl font-extrabold">Pricing config</h1>
        <p className="mt-2 text-sm text-white/50 max-w-2xl">
          Every value here is naira — the server converts to kobo on save. Changing this affects new
          quotes only; a delivery already booked keeps the fare it was quoted at.
        </p>

        {loading || !form ? (
          <div className="mt-8 p-8 text-center text-white/40 text-sm animate-pulse">Loading pricing config...</div>
        ) : (
          <>
            <form onSubmit={handleSave} className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {TIERS.map((t) => (
                  <div key={t.key} className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                    <p className="text-sm font-bold">{t.label}</p>
                    {tierField(form, setForm, t.key, "baseNaira", "Base fare (₦)")}
                    {tierField(form, setForm, t.key, "perKmNaira", "Per km (₦)")}
                    {tierField(form, setForm, t.key, "minimumNaira", "Minimum fare (₦)")}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3 rounded-2xl bg-white/5 border border-white/10 p-4">
                <label className="block">
                  <span className="text-xs font-semibold text-white/50">Round up to nearest (₦)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.roundingNaira}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, roundingNaira: e.target.value } : prev))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-white/50">Detour factor (fallback distance ×)</span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={form.detourFactor}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, detourFactor: e.target.value } : prev))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-white/50">Max trip distance (km)</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    step="1"
                    value={form.maxTripKm}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, maxTripKm: e.target.value } : prev))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                  />
                </label>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {saveMessage && !error && <p className="text-sm text-emerald-400">{saveMessage}</p>}
              {savedUpdatedAt && (
                <p className="text-xs text-white/40">Last saved {new Date(savedUpdatedAt).toLocaleString()}</p>
              )}

              <button
                type="submit"
                disabled={saving || !parsed}
                className="rounded-xl bg-accent text-[#141019] font-bold text-sm px-5 py-3 hover:bg-accent-soft transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save pricing"}
              </button>
            </form>

            {/* Live preview — recomputed on every keystroke via the same
                computeFareKobo() quoteFor() actually charges from, so this
                table can never show a different number than what a customer
                would be quoted with these exact values. A 100x unit mistake
                (typing kobo where naira is expected) is invisible in a form
                field and unmissable here. */}
            <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
                Live fare preview
              </p>
              {!parsed ? (
                <p className="px-5 pb-4 text-sm text-white/40">Fill in every field to see a preview.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/40 text-xs uppercase tracking-wide">
                        <th className="px-5 py-2 font-semibold">Tier</th>
                        {PREVIEW_DISTANCES_KM.map((km) => (
                          <th key={km} className="px-3 py-2 font-semibold text-right">{km} km</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIERS.map((t) => {
                        const tierInput = parsed[t.key];
                        const tierKobo = {
                          baseKobo: Math.round(tierInput.baseNaira * 100),
                          perKmKobo: Math.round(tierInput.perKmNaira * 100),
                          minimumKobo: Math.round(tierInput.minimumNaira * 100),
                        };
                        const roundingKobo = Math.round(parsed.roundingNaira * 100);
                        return (
                          <tr key={t.key} className="border-t border-white/5">
                            <td className="px-5 py-2.5 font-semibold">{t.label}</td>
                            {PREVIEW_DISTANCES_KM.map((km) => (
                              <td key={km} className="px-3 py-2.5 text-right tabular-nums">
                                {formatNaira(computeFareKobo(tierKobo, roundingKobo, km))}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <p className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
                Change history
              </p>
              {history.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-white/40">No changes recorded yet.</p>
              ) : (
                <ul>
                  {history.map((entry) => (
                    <li key={entry.id} className="px-5 py-3 border-t border-white/5 text-sm">
                      <p className="text-white/70">{summarizeChange(entry)}</p>
                      <p className="mt-0.5 text-xs text-white/40">
                        {new Date(entry.changedAt).toLocaleString()} · by {entry.changedBy}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
