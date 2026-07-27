// Real address geocoding via Mapbox, replacing the hardcoded pickup/dropoff
// coordinates that used to make proximity matching meaningless. Autocomplete
// resolves coordinates at selection time, so the booking submit path never
// has to disambiguate free-text against multiple geocoder results.
import { MAPBOX_TOKEN, hasMapbox } from "@/lib/mapbox";

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

/** Forward-geocodes a partial address into a short list of candidates, nearest-relevance first. */
export async function suggestAddresses(searchText: string): Promise<AddressSuggestion[]> {
  if (!hasMapbox()) return [];
  const trimmed = searchText.trim();
  if (trimmed.length < 3) return [];

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to look up address suggestions.");

  const data: { features?: MapboxFeature[] } = await res.json();
  return (data.features ?? [])
    .filter(isValidFeature)
    // Mapbox returns center as [longitude, latitude] — do not swap this order.
    .map((f) => ({
      address: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
    }));
}
