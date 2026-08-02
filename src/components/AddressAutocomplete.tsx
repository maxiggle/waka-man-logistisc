"use client";

import { useEffect, useRef, useState } from "react";
import { suggestAddresses, isGeocodingConfigured, type AddressSuggestion } from "@/lib/geocode";

const SUGGESTION_DEBOUNCE_MS = 300;

export default function AddressAutocomplete({
  id,
  label,
  value,
  onQueryChange,
  onSelect,
  resolved,
  proximity,
}: {
  id: string;
  label: string;
  value: string;
  onQueryChange: (query: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  resolved: AddressSuggestion | null;
  /** Ordering bias for search results — e.g. the resolved default service area. */
  proximity?: { lat: number; lng: number };
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
      suggestAddresses(value, proximity)
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
        setSuggestions(await suggestAddresses(next, proximity));
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
