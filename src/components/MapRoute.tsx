"use client";

import { useEffect, useRef } from "react";

type Stop = { x: number; y: number };

function buildPath(stops: Stop[]): string {
  if (stops.length < 2) return "";
  let d = `M ${stops[0].x} ${stops[0].y}`;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const curr = stops[i];
    const midY = (prev.y + curr.y) / 2;
    // Right-angled "street turns" like a map route: down, across, down.
    d += ` L ${prev.x} ${midY} L ${curr.x} ${midY} L ${curr.x} ${curr.y}`;
  }
  return d;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draws a map-style route line down the page that reveals itself on scroll,
 * with an arrowhead tip and waypoint pins at each [data-route-stop] section.
 * Everything is done imperatively (no React state) so scrolling never
 * triggers re-renders.
 */
export default function MapRoute() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const container = document.getElementById("map-page");
    if (!svg || !container) return;

    let track: SVGPathElement | null = null;
    let line: SVGPathElement | null = null;
    let arrow: SVGGElement | null = null;
    let pins: { g: SVGGElement; outer: SVGCircleElement; inner: SVGCircleElement; y: number }[] = [];
    let total = 0;
    let height = 1;
    let raf = 0;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string>
    ) => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };

    const build = () => {
      const w = container.clientWidth;
      height = container.scrollHeight;
      const anchors = Array.from(
        container.querySelectorAll<HTMLElement>("[data-route-stop]")
      );
      const containerTop =
        container.getBoundingClientRect().top + window.scrollY;
      const stops: Stop[] = anchors.map((a, i) => {
        const r = a.getBoundingClientRect();
        return {
          x: i % 2 === 0 ? w * 0.82 : w * 0.14,
          y: r.top + window.scrollY - containerTop + r.height / 2,
        };
      });
      if (stops.length) {
        stops.unshift({ x: w * 0.5, y: 0 });
        stops.push({ x: w * 0.5, y: height - 8 });
      }
      const d = buildPath(stops);
      if (!d) return;

      svg.setAttribute("viewBox", `0 0 ${w} ${height}`);
      svg.setAttribute("width", `${w}`);
      svg.setAttribute("height", `${height}`);
      svg.replaceChildren();

      track = el("path", {
        d,
        fill: "none",
        stroke: "#4e397c",
        "stroke-opacity": "0.15",
        "stroke-width": "3",
        "stroke-dasharray": "6 14",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      line = el("path", {
        d,
        fill: "none",
        stroke: "#f16834",
        "stroke-width": "5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      svg.append(track, line);

      pins = stops.slice(1, -1).map((s) => {
        const g = el("g", { transform: `translate(${s.x}, ${s.y})` });
        const outer = el("circle", {
          r: "10",
          fill: "#ECE9F2",
          stroke: "#B3A6CC",
          "stroke-width": "2.5",
        });
        const inner = el("circle", { r: "4", fill: "#B3A6CC" });
        outer.style.transition = "fill 0.4s, stroke 0.4s";
        inner.style.transition = "fill 0.4s";
        g.append(outer, inner);
        svg.append(g);
        return { g, outer, inner, y: s.y };
      });

      arrow = el("g", {}) as SVGGElement;
      const halo = el("circle", { r: "13", fill: "#f16834", opacity: "0.25" });
      const head = el("path", { d: "M 0 -9 L 7 6 L 0 2.5 L -7 6 Z", fill: "#4e397c" });
      arrow.append(halo, head);
      arrow.style.opacity = "0";
      svg.append(arrow);

      total = line.getTotalLength();
      line.style.strokeDasharray = `${total}`;
      line.style.strokeDashoffset = `${total}`;
      update();
    };

    const update = () => {
      if (!line || !arrow) return;
      const containerTop =
        container.getBoundingClientRect().top + window.scrollY;
      // The route tip tracks a point ~65% down the viewport.
      const tipY = window.scrollY + window.innerHeight * 0.65 - containerTop;
      const progress = Math.min(1, Math.max(0, tipY / height));
      const drawn = total * progress;
      line.style.strokeDashoffset = `${total - drawn}`;

      const pt = line.getPointAtLength(drawn);
      const ahead = line.getPointAtLength(Math.min(total, drawn + 1));
      const angle =
        (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI + 90;
      arrow.setAttribute("transform", `translate(${pt.x}, ${pt.y}) rotate(${angle})`);
      arrow.style.opacity = progress > 0.005 ? "1" : "0";

      for (const p of pins) {
        const active = tipY >= p.y;
        p.outer.setAttribute("fill", active ? "#f16834" : "#ECE9F2");
        p.outer.setAttribute("stroke", active ? "#4e397c" : "#B3A6CC");
        p.inner.setAttribute("fill", active ? "#ffffff" : "#B3A6CC");
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    // Build once fonts/layout settle, and rebuild on real size changes only.
    build();
    let lastH = container.scrollHeight;
    const ro = new ResizeObserver(() => {
      if (container.scrollHeight !== lastH) {
        lastH = container.scrollHeight;
        build();
      }
    });
    ro.observe(container);
    window.addEventListener("resize", build);
    window.addEventListener("scroll", onScroll, { passive: true });
    // Synchronous refresh hook for tests/tools where rAF may be throttled.
    window.addEventListener("maproute:update", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", build);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("maproute:update", update);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden
    />
  );
}
