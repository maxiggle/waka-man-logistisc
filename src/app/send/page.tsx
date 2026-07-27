"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { matchNearestRider } from "@/lib/dispatch";
import { suggestAddresses, isGeocodingConfigured, type AddressSuggestion } from "@/lib/geocode";
import type { ServiceLevel } from "@/lib/dispatchConfig";

const SUGGESTION_DEBOUNCE_MS = 300;

function AddressField({
  id,
  label,
  value,
  onQueryChange,
  onSelect,
  resolved,
}: {
  id: string;
  label: string;
  value: string;
  onQueryChange: (query: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  resolved: AddressSuggestion | null;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populates the dropdown once on arrival when the field starts pre-filled
  // (e.g. from ?pickup=/?dropoff= query params) — the user still has to tap
  // a suggestion themselves, this only saves them retyping it from scratch.
  useEffect(() => {
    if (!isGeocodingConfigured() || value.trim().length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      suggestAddresses(value)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Intentionally mount-only: subsequent typing is handled by handleChange's own debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (next: string) => {
    onQueryChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isGeocodingConfigured() || next.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setSuggestions(await suggestAddresses(next));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, SUGGESTION_DEBOUNCE_MS);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="text-sm font-semibold text-ink/70">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        autoComplete="off"
        required
        className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {resolved && resolved.address === value && (
        <p className="mt-1 text-xs text-emerald-600">Location confirmed</p>
      )}
      {loading && <p className="mt-1 text-xs text-ink/40">Searching…</p>}
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-xl border border-ink/15 bg-white shadow-lg max-h-56 overflow-auto">
          {suggestions.map((s) => (
            <li key={`${s.lat},${s.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(s);
                  setSuggestions([]);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface"
              >
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Keyed by ServiceLevel (not a plain array) so tsc fails the moment this
// tier list and dispatchConfig's ServiceLevel drift apart in either direction.
const VEHICLE_TIERS: Record<ServiceLevel, { name: string; meta: string; fare: string; hot: boolean }> = {
  express: { name: "Express", meta: "Motorbike · pickup in ~4 min", fare: "₦1,500", hot: true },
  standard: { name: "Standard", meta: "Scooter · pickup in ~9 min", fare: "₦900", hot: false },
  bulk: { name: "Bulk", meta: "Car · pickup in ~14 min", fare: "₦2,400", hot: false },
};
const TIER_ORDER: ServiceLevel[] = ["express", "standard", "bulk"];
const vehicles = TIER_ORDER.map((key) => ({ key, ...VEHICLE_TIERS[key] }));

function SendForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userProfile, loading } = useAuth();

  const [pickup, setPickup] = useState(searchParams.get("pickup") || "");
  const [dropoff, setDropoff] = useState(searchParams.get("dropoff") || "");
  const [pickupResolved, setPickupResolved] = useState<AddressSuggestion | null>(null);
  const [dropoffResolved, setDropoffResolved] = useState<AddressSuggestion | null>(null);
  const [vehicle, setVehicle] = useState<ServiceLevel>("express");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      const p = encodeURIComponent(pickup);
      const d = encodeURIComponent(dropoff);
      router.push(`/login?redirect=/send?pickup=${p}&dropoff=${d}`);
    }
  }, [loading, user, router, pickup, dropoff]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requesting) return;

    if (!isFirebaseConfigured || !db) {
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

    try {
      setRequesting(true);
      setError("");

      const selectedVehicle = vehicles.find((v) => v.key === vehicle);
      const deliveryData = {
        clientId: user.uid,
        clientName: userProfile?.name || user.displayName || "Client",
        clientEmail: user.email || "",
        riderId: null,
        status: "pending",
        pickup: { address: pickupResolved.address, lat: pickupResolved.lat, lng: pickupResolved.lng },
        dropoff: { address: dropoffResolved.address, lat: dropoffResolved.lat, lng: dropoffResolved.lng },
        packageNote: `${selectedVehicle?.name} · ${vehicle.toUpperCase()}`,
        fare: selectedVehicle?.fare || "₦1,500",
        vehicle,
        code: String(Math.floor(1000 + Math.random() * 9000)),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const docRef = await addDoc(collection(db, "deliveries"), deliveryData);

      // Best-effort: try to match a nearby online rider right away. If none
      // are available the delivery just stays "pending" — it'll get picked
      // up the moment a rider nearby comes online (see matchNearestDelivery
      // in src/lib/dispatch.ts).
      try {
        await matchNearestRider(docRef.id, [deliveryData.pickup.lat, deliveryData.pickup.lng]);
      } catch (err) {
        console.error("Rider matching failed:", err);
      }

      router.push(`/track/${docRef.id}`);
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
        <AddressField
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
        />
        <AddressField
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
                <span className="font-bold text-primary">{v.fare}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={requesting}
          className="w-full rounded-xl bg-accent text-ink font-semibold py-4 hover:bg-accent-soft transition-colors cursor-pointer disabled:opacity-80 disabled:cursor-wait"
        >
          {requesting ? "Saving delivery to Firebase…" : `Request rider · ${vehicles.find((v) => v.key === vehicle)?.fare}`}
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
