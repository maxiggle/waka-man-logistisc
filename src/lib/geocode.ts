// Address search, from two providers at once.
//
// Mapbox alone could not find landmarks in Nigeria — not a misconfiguration:
// POI data was removed from Geocoding v5, and the Search Box API Mapbox
// directs you to for POIs covers "the United States, Canada, and Europe".
// Verified against the live API: "University of Port Harcourt", "Uniport",
// "Port Harcourt Mall", "Genesis Hotel" and "Shoprite Port Harcourt" all
// returned zero POI features across Geocoding v5, v6, and Search Box —
// only unrelated streets that happened to contain "Port Harcourt".
//
// That matters more than bad autocomplete UX. A customer who can't find
// their landmark types the nearest street they can, and since WM-101 the
// resolved coordinates set the fare — so a discovery gap silently becomes
// a pricing error.
//
// Photon (OpenStreetMap) has the data Mapbox lacks, including the
// colloquial names people actually use — "Uniport" resolves; on Mapbox it
// returns nothing at all. So both are queried and the results merged:
// Mapbox for well-formed street addresses, Photon for everything with a
// name. Neither is trusted to be up: one provider failing degrades the
// list rather than emptying it.
import { distanceBetween, type Geopoint } from "geofire-common";
import { MAPBOX_TOKEN, hasMapbox } from "@/lib/mapbox";
import { MAX_GEOCODE_DISTANCE_FROM_AREA_KM } from "@/lib/dispatchConfig";

export type AddressSuggestion = {
  address: string;
  lat: number;
  lng: number;
};

/**
 * Komoot's public Photon instance by default. Override to point at a
 * self-hosted one: the public instance is community-run with no SLA and a
 * fair-use expectation, which is fine for development and early traffic but
 * not something to rest a business on. A Nigeria-only OSM extract is small
 * enough to self-host cheaply.
 */
const PHOTON_URL = process.env.NEXT_PUBLIC_PHOTON_URL || "https://photon.komoot.io";

/** How close two results must be to be treated as the same place found twice. */
const DEDUPE_METERS = 75;

const MAX_SUGGESTIONS = 6;

/**
 * Still gated on Mapbox, deliberately, even though Photon needs no key:
 * pricing a trip needs Mapbox Directions (src/server/fare.ts), so a build
 * without a token can search but can't honestly quote. Better to say
 * geocoding isn't configured than to let someone book and be priced off
 * the straight-line fallback without knowing.
 */
export function isGeocodingConfigured(): boolean {
  return hasMapbox();
}

// Untrusted external responses — fields are typed loosely on purpose so a
// malformed feature is caught by the runtime guards below rather than
// assumed valid by the type checker.
type MapboxFeature = { place_name?: unknown; center?: unknown };

function isValidMapboxFeature(f: MapboxFeature): f is { place_name: string; center: [number, number] } {
  if (typeof f.place_name !== "string" || f.place_name.length === 0) return false;
  if (!Array.isArray(f.center) || f.center.length !== 2) return false;
  const [lng, lat] = f.center;
  return typeof lng === "number" && Number.isFinite(lng) && typeof lat === "number" && Number.isFinite(lat);
}

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

/**
 * OSM keys that represent somewhere a package could actually be collected
 * from or delivered to. `highway`, `place`, `boundary` and friends are
 * excluded — they're streets and areas, which Mapbox already returns in a
 * better-formatted shape.
 */
const POI_OSM_KEYS = new Set([
  "amenity",
  "shop",
  "tourism",
  "leisure",
  "office",
  "healthcare",
  "building",
  "historic",
  "aeroway",
  "public_transport",
  "craft",
  "emergency",
  "military",
]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** "Uniport — Alakahia, Rivers" style label from Photon's flat property bag. */
function photonLabel(p: Record<string, unknown>): string | null {
  const name = str(p.name) ?? str(p.street);
  if (!name) return null;
  const context = [str(p.district), str(p.city), str(p.county), str(p.state)]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .slice(0, 2);
  return context.length ? `${name}, ${context.join(", ")}` : name;
}

async function fetchMapbox(
  query: string,
  proximity?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  if (!hasMapbox()) return [];
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    autocomplete: "true",
    limit: "5",
    country: "ng",
  });
  // NOTE: longitude first, same order as Mapbox's `center` field. Reversing
  // this silently puts the bias in the ocean and search quietly gets no better.
  if (proximity) params.set("proximity", `${proximity.lng},${proximity.lat}`);

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`Mapbox geocoding failed (${res.status})`);

  const data: { features?: MapboxFeature[] } = await res.json();
  return (data.features ?? []).filter(isValidMapboxFeature).map((f) => ({
    address: f.place_name,
    // Mapbox returns center as [longitude, latitude] — do not swap this order.
    lng: f.center[0],
    lat: f.center[1],
  }));
}

/** Photon results split into POIs and everything else, so POIs can be ranked first. */
async function fetchPhoton(
  query: string,
  proximity?: { lat: number; lng: number },
): Promise<{ pois: AddressSuggestion[]; others: AddressSuggestion[] }> {
  const params = new URLSearchParams({ q: query, limit: "8" });
  // Photon has no country filter, so bias here and reject non-NG below.
  if (proximity) {
    params.set("lat", String(proximity.lat));
    params.set("lon", String(proximity.lng));
  }

  const res = await fetch(`${PHOTON_URL}/api/?${params.toString()}`);
  if (!res.ok) throw new Error(`Photon geocoding failed (${res.status})`);

  const data: { features?: PhotonFeature[] } = await res.json();
  const pois: AddressSuggestion[] = [];
  const others: AddressSuggestion[] = [];

  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) continue;
    const [lng, lat] = coords;
    if (typeof lng !== "number" || !Number.isFinite(lng)) continue;
    if (typeof lat !== "number" || !Number.isFinite(lat)) continue;

    const p = f.properties ?? {};
    // Same reasoning as Mapbox's country=ng: this is a Nigeria-only service,
    // and a result elsewhere creates a delivery nothing can serve.
    if (str(p.countrycode)?.toUpperCase() !== "NG") continue;

    const address = photonLabel(p);
    if (!address) continue;

    (POI_OSM_KEYS.has(String(p.osm_key)) ? pois : others).push({ address, lat, lng });
  }
  return { pois, others };
}

/**
 * Forward-geocodes a partial address into a short list of candidates.
 *
 * `proximity` is an ordering bias only — nothing is excluded, nearby results
 * just rank first. It's deliberately allowed to be the customer's own live
 * position, which may not be the service area itself (e.g. booking a
 * delivery in the area while travelling).
 *
 * `serviceArea`, when given, is a hard filter (WM-102): any result further
 * than MAX_GEOCODE_DISTANCE_FROM_AREA_KM from it is dropped rather than
 * ranked low, because under distance pricing a wildly-mislocated result
 * doesn't just rank badly, it silently changes the price. Deliberately a
 * separate parameter from `proximity` rather than reusing it — the filter
 * must anchor to the actual service area regardless of where the customer
 * is standing. It applies to both providers.
 *
 * Throws only when every provider that was actually attempted fails. One
 * provider being down is a degraded list, not an error — and the one most
 * likely to be down is the free community instance. An absent Mapbox token
 * is a skip rather than a failure (isGeocodingConfigured() is what gates
 * the UI for that), so a tokenless build with Photon also down yields an
 * empty list instead of an exception.
 */
export async function suggestAddresses(
  searchText: string,
  proximity?: { lat: number; lng: number },
  serviceArea?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  const trimmed = searchText.trim();
  if (trimmed.length < 3) return [];

  const [mapboxResult, photonResult] = await Promise.allSettled([
    fetchMapbox(trimmed, proximity),
    fetchPhoton(trimmed, proximity),
  ]);

  if (mapboxResult.status === "rejected" && photonResult.status === "rejected") {
    console.error("Both geocoders failed:", mapboxResult.reason, photonResult.reason);
    throw new Error("Failed to look up address suggestions.");
  }
  if (mapboxResult.status === "rejected") console.error("Mapbox geocoding failed:", mapboxResult.reason);
  if (photonResult.status === "rejected") console.error("Photon geocoding failed:", photonResult.reason);

  const mapbox = mapboxResult.status === "fulfilled" ? mapboxResult.value : [];
  const photon = photonResult.status === "fulfilled" ? photonResult.value : { pois: [], others: [] };

  // Named places first: they're what Mapbox structurally cannot return, and
  // someone typing "Uniport" wants the university, not a street that shares
  // a word with it. Mapbox's street addresses follow — better formatted than
  // Photon's for the case Mapbox handles well — then Photon's remaining
  // streets and areas to fill any gap.
  const ranked = [...photon.pois, ...mapbox, ...photon.others];

  const merged: AddressSuggestion[] = [];
  for (const candidate of ranked) {
    const duplicate = merged.some(
      (kept) => distanceBetween([kept.lat, kept.lng], [candidate.lat, candidate.lng]) * 1000 <= DEDUPE_METERS,
    );
    if (!duplicate) merged.push(candidate);
    if (merged.length >= MAX_SUGGESTIONS) break;
  }

  if (!serviceArea) return merged;
  const areaCenter: Geopoint = [serviceArea.lat, serviceArea.lng];
  return merged.filter((s) => distanceBetween([s.lat, s.lng], areaCenter) <= MAX_GEOCODE_DISTANCE_FROM_AREA_KM);
}
