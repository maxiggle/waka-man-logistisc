"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { matchNearestRider } from "@/lib/dispatch";
import { createDelivery } from "@/lib/deliveries";
import { fetchQuote, type Quote } from "@/lib/quotes";
import { isGeocodingConfigured, type AddressSuggestion } from "@/lib/geocode";
import { BOOKABLE_SERVICE_LEVELS, type ServiceLevel } from "@/lib/dispatchConfig";
import { currentPositionIfPermitted, getDefaultServiceArea } from "@/lib/serviceAreas";
import { formatNaira } from "@/lib/money";
import type { LatLng } from "@/lib/schemas";
import AddressAutocomplete from "@/components/AddressAutocomplete";

/** How long to let typing/tier-switching settle before spending a Directions call on it. */
const QUOTE_DEBOUNCE_MS = 400;

// Keyed by ServiceLevel (not a plain array) so tsc fails the moment this
// tier list and dispatchConfig's ServiceLevel drift apart in either direction.
//
// No price lives here any more (WM-101 Phase 1) — fares are distance-based,
// so there is no meaningful price before both addresses resolve. The form
// shows one once /api/quotes returns, for whichever tier is selected.
const VEHICLE_TIERS: Record<ServiceLevel, { name: string; meta: string; hot: boolean }> = {
  express: { name: "Express", meta: "Motorbike · pickup in ~4 min", hot: true },
  standard: { name: "Standard", meta: "Scooter · pickup in ~9 min", hot: false },
  bulk: { name: "Bulk", meta: "Car · pickup in ~14 min", hot: false },
};
const TIER_ORDER: ServiceLevel[] = ["express", "standard", "bulk"];
// Only tiers an available transport mode can actually fulfil — booking one
// that nothing can serve leaves the delivery pending forever.
const vehicles = TIER_ORDER.filter((key) => BOOKABLE_SERVICE_LEVELS.includes(key)).map((key) => ({
  key,
  ...VEHICLE_TIERS[key],
}));

function SendForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const [pickup, setPickup] = useState(searchParams.get("pickup") || "");
  const [dropoff, setDropoff] = useState(searchParams.get("dropoff") || "");
  const [pickupResolved, setPickupResolved] = useState<AddressSuggestion | null>(null);
  const [dropoffResolved, setDropoffResolved] = useState<AddressSuggestion | null>(null);
  const [vehicle, setVehicle] = useState<ServiceLevel>(
    vehicles.some((v) => v.key === "express") ? "express" : vehicles[0].key,
  );
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [biasPoint, setBiasPoint] = useState<LatLng | undefined>(undefined);
  const [serviceArea, setServiceArea] = useState<LatLng | undefined>(undefined);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  // Search bias: the customer's own position if already permitted (never
  // prompted for), otherwise the admin-managed default service area. Never
  // blocks typing — suggestAddresses works unbiased until this resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await currentPositionIfPermitted();
      if (cancelled) return;
      if (pos) {
        setBiasPoint(pos);
        return;
      }
      const area = await getDefaultServiceArea();
      if (!cancelled) setBiasPoint({ lat: area.lat, lng: area.lng });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The actual service area centre (WM-102), resolved separately from
  // biasPoint above: biasPoint may be the customer's own live position, but
  // the out-of-area geocoding filter must always anchor to the service area
  // itself, not to wherever the customer happens to be standing.
  useEffect(() => {
    let cancelled = false;
    getDefaultServiceArea().then((area) => {
      if (!cancelled) setServiceArea({ lat: area.lat, lng: area.lng });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const p = encodeURIComponent(pickup);
      const d = encodeURIComponent(dropoff);
      router.push(`/login?redirect=/send?pickup=${p}&dropoff=${d}`);
    }
  }, [loading, user, router, pickup, dropoff]);

  // Prices the trip once both addresses are resolved, debounced so retyping
  // an address or flipping between tiers doesn't spend a Directions call
  // per keystroke — Mapbox's Directions free tier is 100k/month
  // (WM-101). Any change to pickup/dropoff/vehicle invalidates the quote
  // immediately (there is no meaningful price for the old selection any
  // more) and the debounced fetch below produces a fresh one.
  useEffect(() => {
    setQuote(null);
    setQuoteError("");

    if (!user || !pickupResolved || pickupResolved.address !== pickup || !dropoffResolved || dropoffResolved.address !== dropoff) {
      setQuoting(false);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    const timer = setTimeout(() => {
      fetchQuote({
        pickup: { address: pickupResolved.address, lat: pickupResolved.lat, lng: pickupResolved.lng },
        dropoff: { address: dropoffResolved.address, lat: dropoffResolved.lat, lng: dropoffResolved.lng },
        vehicle,
      })
        .then((q) => {
          if (!cancelled) setQuote(q);
        })
        .catch((err: unknown) => {
          if (!cancelled) setQuoteError(err instanceof Error ? err.message : "Could not price this trip.");
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, pickup, dropoff, pickupResolved, dropoffResolved, vehicle]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requesting) return;

    // No direct Firestore handle needed any more — booking goes through
    // /api/deliveries. Firebase still has to be configured for the ID token
    // that call is authorized with.
    if (!isFirebaseConfigured) {
      setError("Firebase is not configured. Please configure your .env.local to enable live delivery booking.");
      return;
    }

    if (!isGeocodingConfigured()) {
      setError("Address lookup is not configured. Please add a Mapbox token to enable delivery booking.");
      return;
    }

    if (!pickupResolved || pickupResolved.address !== pickup) {
      setError("Pick a pickup address from the suggestions list.");
      return;
    }

    if (!dropoffResolved || dropoffResolved.address !== dropoff) {
      setError("Pick a drop-off address from the suggestions list.");
      return;
    }

    if (!user) {
      router.push("/login?redirect=/send");
      return;
    }

    if (!quote) {
      setError(quoting ? "Still pricing this trip — try again in a moment." : "Get a quote before booking.");
      return;
    }

    try {
      setRequesting(true);
      setError("");

      const selectedVehicle = vehicles.find((v) => v.key === vehicle);

      // The server writes the delivery (W5-T4) — the browser can't create
      // one any more. Booking sends only the quoteId from the /api/quotes
      // call above (WM-101 Phase 1): pickup, dropoff, vehicle and the price
      // all come back off that frozen quote, never re-priced here. Sending
      // them again would only be a suggestion the server ignores.
      const { deliveryId } = await createDelivery({
        quoteId: quote.quoteId,
        packageNote: `${selectedVehicle?.name} · ${vehicle.toUpperCase()}`,
      });

      // Navigate immediately rather than waiting on matching — the track
      // page already subscribes to this document with onSnapshot and shows
      // a "Matching nearest available rider..." state until one is
      // assigned, so there's nothing to gain by blocking here.
      router.push(`/track/${deliveryId}`);

      // Fire-and-forget: matching runs server-side now (Wave 2). If it
      // fails or finds nobody, the delivery just stays "pending" — it'll
      // get picked up the moment a rider nearby comes online (see
      // matchNearestDelivery in src/lib/dispatch.ts).
      matchNearestRider(deliveryId).catch((err) => {
        console.error("Rider matching failed:", err);
      });
    } catch (err: unknown) {
      console.error("Error creating delivery:", err);
      const message = err instanceof Error ? err.message : "Failed to create delivery request";
      setError(message);
      setRequesting(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <h2 className="text-xl font-bold text-amber-900">Firebase Setup Required</h2>
          <p className="mt-2 text-sm text-amber-800">
            Cannot submit new deliveries because Firebase environment variables are missing. Add your credentials to <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent">New delivery</p>
      <h1 className="mt-3 text-3xl lg:text-4xl font-extrabold tracking-tight text-primary">
        Send a package
      </h1>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-4">
        <AddressAutocomplete
          id="pickup"
          label="Pickup address"
          value={pickup}
          onQueryChange={(q) => {
            setPickup(q);
            setPickupResolved(null);
          }}
          onSelect={(s) => {
            setPickup(s.address);
            setPickupResolved(s);
          }}
          resolved={pickupResolved}
          proximity={biasPoint}
          serviceArea={serviceArea}
        />
        <AddressAutocomplete
          id="dropoff"
          label="Drop-off address"
          value={dropoff}
          onQueryChange={(q) => {
            setDropoff(q);
            setDropoffResolved(null);
          }}
          onSelect={(s) => {
            setDropoff(s.address);
            setDropoffResolved(s);
          }}
          resolved={dropoffResolved}
          proximity={biasPoint}
          serviceArea={serviceArea}
        />

        <fieldset className="pt-2">
          <legend className="text-sm font-semibold text-ink/70">Vehicle</legend>
          <div className="mt-2 space-y-2.5">
            {vehicles.map((v) => (
              <label
                key={v.key}
                className={`flex items-center justify-between rounded-xl border bg-white px-4 py-3.5 cursor-pointer transition-colors ${
                  vehicle === v.key ? "border-accent ring-2 ring-accent/20" : "border-ink/15 hover:border-ink/30"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="vehicle"
                    value={v.key}
                    checked={vehicle === v.key}
                    onChange={() => setVehicle(v.key)}
                    className="accent-[#f16834]"
                  />
                  <span>
                    <span className="font-bold text-ink">{v.name}</span>
                    {v.hot && (
                      <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-extrabold text-white align-middle">
                        FASTEST
                      </span>
                    )}
                    <span className="block text-xs text-ink/50">{v.meta}</span>
                  </span>
                </span>
                {/* Only the selected tier has a live price — switching tiers requotes
                    rather than showing every tier's price at once, so this is the one
                    Directions call in flight, not three. */}
                <span className="font-bold text-primary">
                  {v.key !== vehicle
                    ? "—"
                    : quoting
                    ? "Pricing…"
                    : quote
                    ? formatNaira(quote.amountKobo)
                    : "—"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {quoteError && (
          <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{quoteError}</p>
        )}

        <button
          type="submit"
          disabled={requesting || quoting || !quote}
          className="w-full rounded-xl bg-accent text-ink font-semibold py-4 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-80 disabled:cursor-wait"
        >
          {requesting
            ? "Finding nearby rider…"
            : quoting
            ? "Pricing…"
            : quote
            ? `Request rider · ${formatNaira(quote.amountKobo)}`
            : "Enter both addresses to see a price"}
        </button>
      </form>
    </div>
  );
}

export default function SendPage() {
  return (
    <main className="min-h-screen bg-surface-deep">
      <header className="bg-surface border-b border-ink/5">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-display font-extrabold text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
            The Waka Man
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold text-ink/60 hover:text-primary transition-colors">
            ← Dashboard
          </Link>
        </nav>
      </header>

      <Suspense fallback={<div className="p-8 text-center text-ink/60">Loading booking form...</div>}>
        <SendForm />
      </Suspense>
    </main>
  );
}
