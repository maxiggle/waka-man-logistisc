"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, MAPBOX_STYLE } from "@/lib/mapbox";
import type { RiderPosition } from "@/lib/native/rider-location";

mapboxgl.accessToken = MAPBOX_TOKEN;

// Fallback centre (Lagos) until the first live fix arrives.
const DEFAULT_CENTER: [number, number] = [3.379, 6.524];

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

export default function LiveMap({ position }: { position: RiderPosition }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const firstFixRef = useRef(true);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: DEFAULT_CENTER,
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapRef.current = map;

    const { el, arrow } = buildMarkerEl();
    arrowRef.current = arrow;
    markerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(DEFAULT_CENTER)
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Move the marker and recentre as new positions arrive.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const lngLat: [number, number] = [position.lng, position.lat];
    marker.setLngLat(lngLat);

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
    } else {
      map.easeTo({ center: lngLat, duration: 900 });
    }
  }, [position]);

  return (
    <>
      <style>{`@keyframes wm-pulse{0%{transform:scale(0.6);opacity:0.5}100%{transform:scale(1.6);opacity:0}}`}</style>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </>
  );
}
