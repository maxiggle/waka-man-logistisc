// Mapbox is optional — when the token is absent the tracking view falls back to
// the SVG route, so the demo keeps working without any map config.
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function hasMapbox(): boolean {
  return MAPBOX_TOKEN.length > 0;
}

// Waka Man dark map style — keeps the tracking card's #1a1626 look.
export const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";
