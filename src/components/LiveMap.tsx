"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import type { RiderPosition } from "@/lib/native/rider-location";
import type { LatLng } from "@/lib/schemas";

mapboxgl.accessToken = MAPBOX_TOKEN;

type RouteGeoJSON = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

function buildMarkerEl(): { el: HTMLDivElement; arrow: HTMLDivElement } {
  const el = document.createElement("div");
  el.style.cssText = "width:28px;height:28px;position:relative;";
  el.innerHTML = `
    <span style="position:absolute;inset:0;border-radius:9999px;background:#f16834;opacity:0.25;animation:wm-pulse 2s ease-out infinite;"></span>
    <span style="position:absolute;inset:9px;border-radius:9999px;background:#f16834;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
    <div class="wm-heading" style="position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;
      border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #f16834;
      margin-left:-5px;margin-top:-16px;opacity:0;"></div>`;
  return { el, arrow: el.querySelector(".wm-heading") as HTMLDivElement };
}

/** Frame the camera to whatever real points are currently available. */
function frameToPoints(map: mapboxgl.Map, points: [number, number][], fallback: [number, number]): void {
  if (points.length >= 2) {
    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new mapboxgl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 15 });
  } else if (points.length === 1) {
    map.jumpTo({ center: points[0], zoom: 15 });
  } else {
    map.jumpTo({ center: fallback, zoom: 13 });
  }
}

export default function LiveMap({
  position,
  pickup,
  dropoff,
  fallbackCenter,
}: {
  position: RiderPosition | null;
  pickup: LatLng | null;
  dropoff: LatLng | null;
  /** Centre to use when no pickup/dropoff/rider point is known yet — the resolved default service area. */
  fallbackCenter: LatLng;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const riderMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const firstFixRef = useRef(true);
  // True once the user has dragged/zoomed/rotated — until then, incoming
  // rider fixes are allowed to recentre the camera.
  const userMovedRef = useRef(false);
  // Guards the one-time pickup/dropoff framing on mount so it doesn't
  // re-fit the camera every time this effect happens to re-run.
  const framedRef = useRef(false);
  const [canRecenter, setCanRecenter] = useState(false);
  const [routeGeoJSON, setRouteGeoJSON] = useState<RouteGeoJSON | null>(null);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [fallbackCenter.lng, fallbackCenter.lat],
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapRef.current = map;

    const onUserMove = () => {
      userMovedRef.current = true;
      setCanRecenter(true);
    };
    map.on("dragstart", onUserMove);
    map.on("zoomstart", onUserMove);
    map.on("rotatestart", onUserMove);

    return () => {
      map.off("dragstart", onUserMove);
      map.off("zoomstart", onUserMove);
      map.off("rotatestart", onUserMove);
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
      arrowRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
    };
    // Runs once: fallbackCenter is only needed for the very first camera
    // position, and later changes are picked up by the effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Static pickup/dropoff pins — added when their coordinate is known,
  // removed if it ever goes away (e.g. a delivery document update).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickup) {
      const lngLat: [number, number] = [pickup.lng, pickup.lat];
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new mapboxgl.Marker({ color: "#f16834" }).setLngLat(lngLat).addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat(lngLat);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    if (dropoff) {
      const lngLat: [number, number] = [dropoff.lng, dropoff.lat];
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = new mapboxgl.Marker({ color: "#8a6fc4" }).setLngLat(lngLat).addTo(map);
      } else {
        dropoffMarkerRef.current.setLngLat(lngLat);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }

    // One-time initial framing to the endpoints — only before a rider marker
    // exists; once a rider is live, the position effect below owns framing.
    if (!framedRef.current && !riderMarkerRef.current) {
      framedRef.current = true;
      const points: [number, number][] = [];
      if (pickup) points.push([pickup.lng, pickup.lat]);
      if (dropoff) points.push([dropoff.lng, dropoff.lat]);
      frameToPoints(map, points, [fallbackCenter.lng, fallbackCenter.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  // The resolved default service area can arrive after mount (it's an async
  // Firestore read) — if nothing else is known yet and the user hasn't taken
  // over the camera, follow it to the newly-resolved centre.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pickup || dropoff || riderMarkerRef.current || userMovedRef.current) return;
    map.jumpTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackCenter.lat, fallbackCenter.lng]);

  // Rider marker: created lazily on the first real fix (never planted at the
  // fallback centre), moved on every subsequent one, removed if position
  // goes back to null.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!position) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.remove();
        riderMarkerRef.current = null;
        arrowRef.current = null;
      }
      return;
    }

    const lngLat: [number, number] = [position.lng, position.lat];

    if (!riderMarkerRef.current) {
      const { el, arrow } = buildMarkerEl();
      arrowRef.current = arrow;
      riderMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
    } else {
      riderMarkerRef.current.setLngLat(lngLat);
    }

    if (arrowRef.current) {
      if (position.heading != null) {
        arrowRef.current.style.opacity = "1";
        arrowRef.current.style.transform = `rotate(${position.heading}deg)`;
      } else {
        arrowRef.current.style.opacity = "0";
      }
    }

    if (firstFixRef.current) {
      firstFixRef.current = false;
      map.jumpTo({ center: lngLat, zoom: 15 });
    } else if (!userMovedRef.current) {
      // Follow the rider until the user takes control of the map — a client
      // who pans to look at the dropoff should not be dragged back on the
      // next fix (they arrive every ~4s).
      map.easeTo({ center: lngLat, duration: 900 });
    }
  }, [position]);

  // Real driving route, pickup → dropoff. Fetched once per delivery, never
  // on a position update — that would be one billed Directions call every
  // ~4s per viewer.
  useEffect(() => {
    if (!pickup || !dropoff) return;
    const controller = new AbortController();
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords)) {
          setRouteGeoJSON({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // A missing route must never blank the map — it just renders without one.
        console.error("Failed to fetch delivery route:", err);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  // Draw/update the route line once the style has loaded (adding a layer
  // before that throws).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeGeoJSON) return;

    const addOrUpdate = () => {
      const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(routeGeoJSON);
        return;
      }
      map.addSource("route", { type: "geojson", data: routeGeoJSON });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f16834", "line-width": 4, "line-opacity": 0.6 },
      });
    };

    if (map.isStyleLoaded()) addOrUpdate();
    else map.once("load", addOrUpdate);
  }, [routeGeoJSON]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    if (pickup) points.push([pickup.lng, pickup.lat]);
    if (dropoff) points.push([dropoff.lng, dropoff.lat]);
    const riderLngLat = riderMarkerRef.current?.getLngLat();
    if (riderLngLat) points.push([riderLngLat.lng, riderLngLat.lat]);
    frameToPoints(map, points, [fallbackCenter.lng, fallbackCenter.lat]);
    userMovedRef.current = false;
    setCanRecenter(false);
  };

  return (
    <>
      <style>{`@keyframes wm-pulse{0%{transform:scale(0.6);opacity:0.5}100%{transform:scale(1.6);opacity:0}}`}</style>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {canRecenter && (
        <button
          type="button"
          onClick={handleRecenter}
          className="absolute top-4 right-4 z-10 rounded-full bg-black/40 backdrop-blur px-4 py-1.5 text-xs font-semibold text-white/90 hover:bg-black/55 transition-colors cursor-pointer"
        >
          Recentre
        </button>
      )}
    </>
  );
}
