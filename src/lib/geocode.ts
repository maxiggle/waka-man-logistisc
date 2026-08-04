// Real address geocoding via Mapbox, replacing the hardcoded pickup/dropoff
// coordinates that used to make proximity matching meaningless. Autocomplete
// resolves coordinates at selection time, so the booking submit path never
// has to disambiguate free-text against multiple geocoder results.
import { distanceBetween, type Geopoint } from "geofire-common";
import { MAPBOX_TOKEN, hasMapbox } from "@/lib/mapbox";
import { MAX_GEOCODE_DISTANCE_FROM_AREA_KM } from "@/lib/dispatchConfig";

export type AddressSuggestion = {
  address: string;
  lat: number;
  lng: number;
};

export function isGeocodingConfigured(): boolean {
  return hasMapbox();
}

// Untrusted external response — fields are typed loosely on purpose so a
// malformed feature (missing/short/non-numeric center) is caught by the
// runtime guard below rather than assumed valid by the type checker.
type MapboxFeature = {
  place_name?: unknown;
  center?: unknown;
};

function isValidFeature(f: MapboxFeature): f is { place_name: string; center: [number, number] } {
  if (typeof f.place_name !== "string" || f.place_name.length === 0) return false;
  if (!Array.isArray(f.center) || f.center.length !== 2) return false;
  const [lng, lat] = f.center;
  return typeof lng === "number" && Number.isFinite(lng) && typeof lat === "number" && Number.isFinite(lat);
}

/**
 * Forward-geocodes a partial address into a short list of candidates,
 * nearest-relevance first.
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
 * is standing.
 *
 * `country` is a hard filter for the same underlying reason: this is a
 * Nigeria-only service and a result elsewhere would create a delivery
 * nothing can ever be matched to serve.
 */
export async function suggestAddresses(
  searchText: string,
  proximity?: { lat: number; lng: number },
  serviceArea?: { lat: number; lng: number },
): Promise<AddressSuggestion[]> {
  if (!hasMapbox()) return [];
  const trimmed = searchText.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    autocomplete: "true",
    limit: "5",
    country: "ng",
  });
  // NOTE: longitude first, same order as Mapbox's `center` field. Reversing
  // this silently puts the bias in the ocean and search quietly gets no better.
  if (proximity) params.set("proximity", `${proximity.lng},${proximity.lat}`);

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to look up address suggestions.");

  const data: { features?: MapboxFeature[] } = await res.json();
  const suggestions = (data.features ?? [])
    .filter(isValidFeature)
    // Mapbox returns center as [longitude, latitude] — do not swap this order.
    .map((f) => ({
      address: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
    }));

  if (!serviceArea) return suggestions;
  const areaCenter: Geopoint = [serviceArea.lat, serviceArea.lng];
  return suggestions.filter((s) => distanceBetween([s.lat, s.lng], areaCenter) <= MAX_GEOCODE_DISTANCE_FROM_AREA_KM);
}
