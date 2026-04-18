import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, useReducedMotion } from "framer-motion";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { BusinessScopeServiceArea } from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import type { StudioBaseLocation } from "@/lib/studioBaseLocation.ts";
import { loadServiceAreaPolygons } from "@/lib/serviceAreaPicker/serviceAreaDatasetLoader.ts";
import { lookupCityPolygon } from "@/lib/serviceAreaPicker/cityPolygonLookup.ts";
import { getContinentById } from "@/lib/serviceAreaPicker/serviceAreaContinents.ts";
import { cn } from "@/lib/utils";

/**
 * Final resting opacity for the world-countries layers — the map draws these
 * in from 0 once MapLibre has finished loading, so the landmass reads as if
 * it's "developing" onto the page.
 */
const COUNTRY_FILL_OPACITY = 0.08;
const COUNTRY_LINE_OPACITY = 0.25;
/** Duration of the country-polygon fade-in after MapLibre load (ms). */
const COUNTRY_REVEAL_DURATION_MS = 1100;

/** Framer-motion entrance applied to the map container itself. */
const MAP_CONTAINER_INITIAL = {
  opacity: 0,
  y: 24,
  scale: 0.965,
  filter: "blur(10px)",
};
const MAP_CONTAINER_ANIMATE = {
  opacity: 1,
  y: 0,
  scale: 1,
  filter: "blur(0px)",
};
const MAP_CONTAINER_TRANSITION = {
  duration: 0.9,
  ease: [0.22, 1, 0.36, 1] as const,
  delay: 0.15,
};

/**
 * No-basemap style: MapLibre canvas stays transparent (no `background` layer),
 * so the page gradient shows through everywhere except where we draw country
 * polygons. Country shapes are the only visual; oceans are literally absent.
 */
const STYLE_SPEC: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

/**
 * Default idle frame: tight bbox around inhabited land (everything except
 * extreme Antarctica). fitBounds lets the map adapt to the container's
 * aspect ratio so the landmass fills the frame top-to-bottom without a
 * dead "sky" band above it.
 */
const DEFAULT_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-170, -58],
  [180, 82],
];

/**
 * Padding applied whenever we frame `DEFAULT_BOUNDS`. The oversized top pad
 * shifts the whole landmass downward inside the container so there's breathing
 * room between the search bar and the map's northern edge.
 */
const DEFAULT_BOUNDS_PADDING = { top: 120, bottom: 8, left: 8, right: 8 };

const COUNTRY_PREFIX = "ne:country:";

function unionBbox(boxes: [number, number, number, number][]): maplibregl.LngLatBoundsLike | null {
  if (boxes.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const b of boxes) {
    w = Math.min(w, b[0]!);
    s = Math.min(s, b[1]!);
    e = Math.max(e, b[2]!);
    n = Math.max(n, b[3]!);
  }
  return [
    [w, s],
    [e, n],
  ];
}

function stripSelectionLayers(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  const layers = [...style.layers].reverse();
  for (const layer of layers) {
    if (layer.id.startsWith("sa-")) {
      try {
        map.removeLayer(layer.id);
      } catch {
        /* ignore */
      }
    }
  }
  const sources = map.getStyle().sources ?? {};
  for (const id of Object.keys(sources)) {
    if (id.startsWith("sa-src-")) {
      try {
        map.removeSource(id);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Build the DOM element used by the home-base `maplibregl.Marker`.
 *
 * A DOM marker (vs. a GeoJSON circle layer) gives us two things we
 * explicitly want for the operator's home pin:
 *   1. True "teardrop" shape anchored at the bottom tip — the pin
 *      reads as *here*, not just *around here*.
 *   2. Automatic z-stacking above every MapLibre layer without
 *      coordinating `moveLayer` with the async selection-polygon
 *      effect. DOM markers live above the canvas.
 *
 * The pin is styled as a saturated red teardrop with a white core so
 * it stays readable against both the dim country polygons and the
 * bright amber service-area fills.
 */
function createHomePinElement(label: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `Home base: ${label}`);
  // `pointer-events: none` so the pin never swallows map clicks —
  // the operator can still click *through* it to reopen search.
  wrap.style.pointerEvents = "none";
  wrap.style.willChange = "transform";
  wrap.innerHTML = `
    <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg"
         style="display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));">
      <path d="M13 1.25C6.787 1.25 1.75 6.287 1.75 12.5c0 8.5 11.25 20.25 11.25 20.25S24.25 21 24.25 12.5C24.25 6.287 19.213 1.25 13 1.25z"
            fill="#ef4444" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="13" cy="12.5" r="4" fill="#ffffff"/>
    </svg>
  `;
  return wrap;
}

/**
 * Build a geodesic circle polygon around a lng/lat centroid for city-style service areas.
 * Cities don't ship real administrative boundaries in our dataset (GeoNames gives points),
 * so we synthesize a ~25 km coverage disc. Used instead of a point circle so the selection
 * reads as an *area* not a pin.
 */
function createCirclePolygon(
  center: [number, number],
  radiusKm: number,
  steps = 64,
): Feature<Polygon> {
  const [lng, lat] = center;
  const earthKm = 6371;
  const angular = radiusKm / earthKm;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const sinNewLat =
      Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing);
    const newLat = Math.asin(sinNewLat);
    const newLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * sinNewLat,
      );
    coords.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function buildCountriesFeatureCollection(
  features: Record<string, Feature<Polygon | MultiPolygon>>,
): FeatureCollection {
  const out: Feature[] = [];
  for (const [id, f] of Object.entries(features)) {
    if (!id.startsWith(COUNTRY_PREFIX)) continue;
    if (!f?.geometry) continue;
    out.push({
      type: "Feature",
      properties: { id },
      geometry: f.geometry,
    });
  }
  return { type: "FeatureCollection", features: out };
}

/**
 * Build a FeatureCollection containing country polygons for the given ISO2 codes.
 * Unknown codes are silently skipped (e.g. AQ, small islands we don't ship).
 */
function buildMemberCountriesFeatureCollection(
  features: Record<string, Feature<Polygon | MultiPolygon>>,
  iso2Members: readonly string[],
): FeatureCollection {
  const out: Feature[] = [];
  for (const iso2 of iso2Members) {
    const f = features[`${COUNTRY_PREFIX}${iso2}`];
    if (!f?.geometry) continue;
    out.push({
      type: "Feature",
      properties: { id: `${COUNTRY_PREFIX}${iso2}` },
      geometry: f.geometry,
    });
  }
  return { type: "FeatureCollection", features: out };
}

export type ServiceAreaPickerMapPreviewProps = {
  selected: BusinessScopeServiceArea[];
  className?: string;
  /** When set, map click reports lng/lat (custom area placement). */
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  mapClickMode?: boolean;
  /**
   * Fires on *any* click inside the map canvas, regardless of
   * `mapClickMode`. Used to let the picker open its search shell when
   * the operator clicks the map — their intent is always "I want to
   * search", not lat/lng placement, outside the custom-area flow.
   */
  onClick?: () => void;
  /**
   * The studio's home base, rendered as a distinct white ring marker
   * on top of the service-area polygons so the operator always has a
   * visual anchor for "where I am" while choosing "where I work".
   */
  baseLocation?: StudioBaseLocation | null;
};

export function ServiceAreaPickerMapPreview({
  selected,
  className,
  onMapClick,
  mapClickMode,
  onClick,
  baseLocation,
}: ServiceAreaPickerMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  /**
   * The home-base pin is a DOM marker (not a paint layer), so it lives
   * outside MapLibre's layer graph and needs its own ref for cleanup.
   * Kept separate from `mapRef` so phase flips / re-picks can reset the
   * marker without touching the map instance.
   */
  const baseMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el,
        style: STYLE_SPEC,
        bounds: DEFAULT_BOUNDS,
        fitBoundsOptions: { padding: DEFAULT_BOUNDS_PADDING, animate: false },
        renderWorldCopies: false,
        attributionControl: false,
      });
      mapRef.current = map;
    } catch (err) {
      console.error("[ServiceAreaPickerMapPreview] map init failed", err);
      queueMicrotask(() => setMapError(String((err as Error)?.message ?? err)));
      return;
    }

    map.on("error", (ev) => {
      console.warn("[ServiceAreaPickerMapPreview] map error", ev?.error ?? ev);
    });

    map.on("load", () => {
      void (async () => {
        try {
          const polyBundle = await loadServiceAreaPolygons();
          const fc = buildCountriesFeatureCollection(polyBundle.features);
          if (!mapRef.current) return;
          map.addSource("world-countries", { type: "geojson", data: fc });
          // Seed at 0 so the landmass fades in (the "draw-in" effect the
          // container reveal composes with). If the user prefers reduced
          // motion we jump straight to final opacity.
          const startFill = reduceMotion ? COUNTRY_FILL_OPACITY : 0;
          const startLine = reduceMotion ? COUNTRY_LINE_OPACITY : 0;
          map.addLayer({
            id: "world-countries-fill",
            type: "fill",
            source: "world-countries",
            paint: {
              "fill-color": "#ffffff",
              "fill-opacity": startFill,
            },
          });
          map.addLayer({
            id: "world-countries-line",
            type: "line",
            source: "world-countries",
            paint: {
              "line-color": "#ffffff",
              "line-width": 0.6,
              "line-opacity": startLine,
            },
          });

          if (!reduceMotion) {
            // Tween the paint opacities to their final values via rAF. We
            // can't use MapLibre's built-in paint transitions here because
            // they're clobbered by later `setPaintProperty` calls; a manual
            // tween gives us a single smooth reveal we fully control.
            const started = performance.now();
            // Delay slightly so the container's framer reveal starts first
            // and the map "develops" into the already-present frame.
            const delay = 220;
            const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
            const step = () => {
              if (mapRef.current !== map) return;
              const now = performance.now();
              const t = Math.max(
                0,
                Math.min(1, (now - started - delay) / COUNTRY_REVEAL_DURATION_MS),
              );
              const eased = easeOutCubic(t);
              try {
                map.setPaintProperty(
                  "world-countries-fill",
                  "fill-opacity",
                  eased * COUNTRY_FILL_OPACITY,
                );
                map.setPaintProperty(
                  "world-countries-line",
                  "line-opacity",
                  eased * COUNTRY_LINE_OPACITY,
                );
              } catch {
                /* layers may have been removed during fast unmount */
              }
              if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        } catch (e) {
          console.warn("[ServiceAreaPickerMapPreview] countries load failed", e);
        } finally {
          setLayersReady(true);
        }
      })();
    });

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    const handler = (ev: maplibregl.MapMouseEvent) => {
      if (onMapClick && mapClickMode) {
        onMapClick({ lng: ev.lngLat.lng, lat: ev.lngLat.lat });
        return;
      }
      // Non-placement click — treat as "operator wants to search". We
      // don't care where they clicked, just that they interacted with
      // the map surface.
      onClick?.();
    };
    map.on("click", handler);
    map.getCanvas().style.cursor = mapClickMode && onMapClick
      ? "crosshair"
      : onClick
        ? "pointer"
        : "";

    return () => {
      map.off("click", handler);
      map.getCanvas().style.cursor = "";
    };
  }, [layersReady, mapClickMode, onMapClick, onClick]);

  // Home-base pin: a DOM marker anchored at the operator's home
  // coordinate. Managed separately from selection polygons so it
  // doesn't get clobbered by `stripSelectionLayers` and doesn't need
  // z-order coordination with async polygon drawing — DOM markers
  // always sit above the canvas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tear down the previous pin (if any) before deciding whether to
    // draw a new one. Handles both "base changed" and "base cleared".
    if (baseMarkerRef.current) {
      baseMarkerRef.current.remove();
      baseMarkerRef.current = null;
    }

    if (!baseLocation) return;

    const el = createHomePinElement(baseLocation.label);
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(baseLocation.centroid)
      .addTo(map);
    baseMarkerRef.current = marker;

    return () => {
      marker.remove();
      if (baseMarkerRef.current === marker) {
        baseMarkerRef.current = null;
      }
    };
  }, [baseLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    // Effect-scoped cancellation token. `selected` is spread into a new
    // array by the parent on every render, so this effect can re-enter
    // while an earlier async run is still awaiting the polygon fetch.
    // Without this guard two overlapping runs would both try to
    // `addSource("sa-src-0", ...)` and the later one would throw
    // "source already exists", leaving a stale UI on screen.
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      stripSelectionLayers(map);
      if (selected.length === 0) {
        map.fitBounds(DEFAULT_BOUNDS, { padding: DEFAULT_BOUNDS_PADDING, duration: 400 });
        // Home-base recenter is still meaningful with no coverage
        // selected, so fall through to the flyTo-base block below —
        // but we have no polygons to draw, so exit draw-loop early.
        if (baseLocation) {
          try {
            map.flyTo({
              center: baseLocation.centroid,
              zoom: baseLocation.kind === "country" ? 4 : 6,
              duration: 700,
              essential: true,
            });
          } catch {
            /* ignore — map may be disposing */
          }
        }
        return;
      }

      try {
        const polyBundle = await loadServiceAreaPolygons();
        if (cancelled) return;
        const features = polyBundle.features;

        let i = 0;
        for (const area of selected) {
          const srcId = `sa-src-${i}`;
          const baseId = `sa-${i}`;
          i += 1;

          if (area.kind === "worldwide" || area.kind === "continent") {
            const members =
              area.kind === "worldwide"
                ? Object.keys(features)
                    .filter((id) => id.startsWith(COUNTRY_PREFIX))
                    .map((id) => id.slice(COUNTRY_PREFIX.length))
                : (getContinentById(area.provider_id)?.iso2_members ?? []);
            const fc = buildMemberCountriesFeatureCollection(features, members);
            if (fc.features.length === 0) continue;
            map.addSource(srcId, { type: "geojson", data: fc });
            map.addLayer({
              id: `${baseId}-fill`,
              type: "fill",
              source: srcId,
              paint: { "fill-color": "#f59e0b", "fill-opacity": 0.55 },
            });
            map.addLayer({
              id: `${baseId}-line`,
              type: "line",
              source: srcId,
              paint: { "line-color": "#fbbf24", "line-width": 1.4, "line-opacity": 0.95 },
            });
            continue;
          }

          if (area.kind === "city" || area.kind === "custom") {
            // Draw a disc immediately as a placeholder (Nominatim request is async), then
            // asynchronously upgrade to the real OSM admin polygon when it arrives.
            const radiusKm = area.kind === "city" ? 25 : 40;
            const disc = createCirclePolygon(area.centroid, radiusKm);
            map.addSource(srcId, { type: "geojson", data: disc });
            map.addLayer({
              id: `${baseId}-fill`,
              type: "fill",
              source: srcId,
              paint: { "fill-color": "#f59e0b", "fill-opacity": 0.5 },
            });
            map.addLayer({
              id: `${baseId}-line`,
              type: "line",
              source: srcId,
              paint: { "line-color": "#fbbf24", "line-width": 1.4, "line-opacity": 0.95 },
            });
            if (area.kind === "city") {
              void (async () => {
                const real = await lookupCityPolygon(area.label, area.country_code);
                const stillMounted = mapRef.current === map;
                if (!real || !stillMounted) return;
                const src = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
                if (src && typeof src.setData === "function") {
                  src.setData(real);
                }
              })();
            }
            continue;
          }

          const f = features[area.provider_id];
          if (f) {
            map.addSource(srcId, { type: "geojson", data: f });
            map.addLayer({
              id: `${baseId}-fill`,
              type: "fill",
              source: srcId,
              paint: { "fill-color": "#f59e0b", "fill-opacity": 0.55 },
            });
            map.addLayer({
              id: `${baseId}-line`,
              type: "line",
              source: srcId,
              paint: { "line-color": "#fbbf24", "line-width": 1.4, "line-opacity": 0.95 },
            });
          }
        }

        // Cities / custom pins only have a ~6 km stored bbox but we draw a 25–40 km
        // disc; expand their effective bbox so fitBounds keeps the disc visible.
        const effectiveBoxes = selected.map((a) => {
          if (a.kind !== "city" && a.kind !== "custom") return a.bbox;
          const [lng, lat] = a.centroid;
          const radiusDeg = a.kind === "city" ? 0.3 : 0.5;
          const lngPad = radiusDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
          return [lng - lngPad, lat - radiusDeg, lng + lngPad, lat + radiusDeg] as [
            number,
            number,
            number,
            number,
          ];
        });
        const u = unionBbox(effectiveBoxes);
        if (u) {
          map.fitBounds(u, { padding: 48, maxZoom: 8, duration: 500 });
        }
      } catch (e) {
        console.warn("[ServiceAreaPickerMapPreview]", e);
      }
    };

    // MapLibre reports `layersReady` as soon as we've added the world
    // countries source/layer, but the style may still be digesting that
    // mutation on the next microtask. Calling `addSource` at that
    // instant throws "style is not done loading". On fresh mount we
    // mask this because subsequent user clicks re-trigger the effect
    // once the style stabilizes, but on **re-mount** (navigating back
    // into the step with selections already present) the effect fires
    // exactly once and — if the style isn't ready yet — never retries,
    // leaving the map painted but empty. Wait for `idle` so the draw
    // happens as soon as MapLibre is quiescent.
    if (map.isStyleLoaded()) {
      void run();
    } else {
      const onIdle = () => {
        if (cancelled) return;
        void run();
      };
      map.once("idle", onIdle);
      return () => {
        cancelled = true;
        try {
          map.off("idle", onIdle);
        } catch {
          /* ignore — map may already be removed */
        }
      };
    }

    return () => {
      cancelled = true;
    };
  }, [selected, baseLocation, layersReady]);

  if (mapError) {
    return (
      <div
        className={cn(
          "flex min-h-[220px] items-center justify-center px-4 text-center text-[13px] text-white/60",
          className,
        )}
      >
        Map preview unavailable.
      </div>
    );
  }

  // Container entrance: lift + fade + de-blur + gentle scale. Composes
  // with the internal "country polygons fade in" tween above to read as a
  // single editorial reveal — the frame rises onto the page, then the
  // landmass develops inside it.
  return (
    <motion.div
      initial={reduceMotion ? false : MAP_CONTAINER_INITIAL}
      animate={reduceMotion ? undefined : MAP_CONTAINER_ANIMATE}
      transition={MAP_CONTAINER_TRANSITION}
      className={cn("h-[320px] w-full sm:h-[400px] md:h-[480px]", className)}
      style={{ willChange: "transform, opacity, filter" }}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Service area map preview"
      />
    </motion.div>
  );
}
