import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useServiceAreaPickerSelection } from "@/hooks/useServiceAreaPickerSelection.ts";
import type {
  BusinessScopeServiceArea,
  BusinessScopeServiceAreaKind,
  ServiceAreaSearchResult,
} from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import { bundledResultToServiceArea } from "@/lib/serviceAreaPicker/serviceAreaSelectionHelpers.ts";
import {
  bundledSearchResultToStudioBaseLocation,
  customStudioBaseLocation,
  type StudioBaseLocation,
} from "@/lib/studioBaseLocation.ts";
import { ServiceAreaPickerCustomAreaDialog } from "./ServiceAreaPickerCustomAreaDialog.tsx";
import { ServiceAreaPickerMapPreview } from "./ServiceAreaPickerMapPreview.tsx";
import { ServiceAreaPickerSearchInput } from "./ServiceAreaPickerSearchInput.tsx";
import { cn } from "@/lib/utils";

export type ServiceAreaPickerProps = {
  value: BusinessScopeServiceArea[];
  onChange: (next: BusinessScopeServiceArea[]) => void;
  studioCountryCode?: string;
  className?: string;
  /**
   * The studio's home base. When `null`/`undefined` the picker surfaces
   * the base-location phase *first* (search filtered to city/region/country
   * + custom); once set it flips to the coverage phase (the current UX).
   */
  baseLocation?: StudioBaseLocation | null;
  /** Fired when the operator picks or replaces their home base. */
  onChangeBaseLocation?: (next: StudioBaseLocation) => void;
  /** Fired when the operator asks to re-pick their home base. */
  onClearBaseLocation?: () => void;
};

function selectionKey(a: BusinessScopeServiceArea): string {
  return `${a.provider}:${a.provider_id}`;
}

const TRIGGER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Shared width + **fixed height** for the "ghost → input" transformation.
 * The shell reserves the full input height at rest so the map below
 * never shifts when the ghost morphs into the search field — the ghost
 * just floats centered inside the reserved space. Without this the
 * expansion reads as "everything jumps down", which is what we're
 * specifically avoiding here.
 */
const SEARCH_SHELL_WIDTH = "w-full max-w-md";
/**
 * Measured to match the input's intrinsic height (py-3 + 15px line) —
 * the input itself stays its natural size; the ghost just gets more
 * vertical breathing room so swapping between them is zero-displacement.
 */
const SEARCH_SHELL_HEIGHT = "h-[52px]";
const SHELL_TRANSITION = { duration: 0.42, ease: TRIGGER_EASE } as const;

/**
 * Kinds allowed when the operator is picking their *home base* (phase 1).
 * Continents and "worldwide" aren't valid answers to "where are you based?".
 */
const BASE_LOCATION_KIND_FILTER: readonly BusinessScopeServiceAreaKind[] = [
  "city",
  "region",
  "country",
  "custom",
];

export function ServiceAreaPicker({
  value,
  onChange,
  studioCountryCode,
  className,
  baseLocation,
  onChangeBaseLocation,
  onClearBaseLocation,
}: ServiceAreaPickerProps) {
  const selection = useServiceAreaPickerSelection({ value, onChange });
  const reduceMotion = useReducedMotion();

  /**
   * Two-phase behaviour: phase 1 captures the studio's home base, phase 2
   * captures the places they want to *work*. Once a base is set the picker
   * stays in coverage phase; the "Change base location" affordance in the
   * sidebar resets it via `onClearBaseLocation`.
   *
   * When `onChangeBaseLocation` isn't wired (e.g. legacy caller), the
   * picker falls back to the old single-phase coverage behaviour so nothing
   * regresses.
   */
  const phase: "base" | "coverage" =
    onChangeBaseLocation && !baseLocation ? "base" : "coverage";

  const [searchOpen, setSearchOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [customDialogKey, setCustomDialogKey] = useState(0);

  const selectedAreas = useMemo(() => value, [value]);

  // When the phase flips (base → coverage), collapse the search shell so
  // the operator sees the full map before diving back into typing.
  useEffect(() => {
    setSearchOpen(false);
  }, [phase]);

  const handleSelectCoverage = useCallback(
    (r: ServiceAreaSearchResult) => {
      selection.add(bundledResultToServiceArea(r));
      setSearchOpen(false);
    },
    [selection],
  );

  const handleSelectBase = useCallback(
    (r: ServiceAreaSearchResult) => {
      const next = bundledSearchResultToStudioBaseLocation(r);
      if (!next) return;
      onChangeBaseLocation?.(next);
      setSearchOpen(false);
    },
    [onChangeBaseLocation],
  );

  const handleRequestCustom = useCallback((q: string) => {
    setCustomDraft(q);
    setCustomDialogKey((k) => k + 1);
    setSearchOpen(false);
    setCustomOpen(true);
  }, []);

  const handleConfirmCustom = useCallback(
    (area: BusinessScopeServiceArea) => {
      if (phase === "base") {
        // Reuse the custom-area dialog for base too: map its lat/lng output
        // into a `StudioBaseLocation` of kind "custom" instead of adding it
        // to the coverage list.
        onChangeBaseLocation?.(
          customStudioBaseLocation(area.label, area.centroid, area.bbox),
        );
      } else {
        selection.add(area);
      }
    },
    [onChangeBaseLocation, phase, selection],
  );

  // Collapse the inline search back to the ghost trigger when the user
  // clicks away or hits Escape. The search input handles its own dropdown
  // open/close, so this only governs the ghost ↔ input morph.
  useEffect(() => {
    if (!searchOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (shellRef.current?.contains(target)) return;
      // Skip clicks that land on the map canvas — the map preview
      // itself re-opens the search on click (that's the whole feature).
      // Without this guard the sequence "mousedown closes search" →
      // "click re-opens search" renders as a one-frame flicker.
      if (target.closest(".maplibregl-canvas")) return;
      setSearchOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  // Per-phase copy for the ghost trigger + placeholder. Keeping these
  // literal strings here (rather than threading through `copy` on the
  // parent) keeps the picker self-contained and lets the parent step
  // component own the H1/hint wording independently.
  const triggerLabel =
    phase === "base" ? "Add your home city…" : "Add a place…";
  const inputPlaceholder =
    phase === "base"
      ? "Search your city, region, or country…"
      : "Search cities, regions, and countries…";
  const triggerAriaLabel =
    phase === "base" ? "Add your home location" : "Add a place";

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      {/*
        Search shell — morphs in place between two states:
          1. Ghost trigger: pure text ("Add your home city…" in phase 1,
             "Add a place…" in phase 2) with a subtle underline that
             brightens on hover / focus.
          2. Inline search input: the real
             `ServiceAreaPickerSearchInput` with its own listbox. In
             phase 1 the input restricts results to city/region/country
             so "worldwide" can't become a base location.
      */}
      <motion.div
        ref={shellRef}
        transition={reduceMotion ? { duration: 0 } : SHELL_TRANSITION}
        className={cn(SEARCH_SHELL_WIDTH, SEARCH_SHELL_HEIGHT, "relative")}
      >
        <AnimatePresence initial={false}>
          {searchOpen ? (
            <motion.div
              key="search-input"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.12, ease: TRIGGER_EASE }}
              className="absolute inset-x-0 top-0"
            >
              <ServiceAreaPickerSearchInput
                biasCountryCode={studioCountryCode}
                onSelect={
                  phase === "base" ? handleSelectBase : handleSelectCoverage
                }
                onRequestCustom={handleRequestCustom}
                placeholder={inputPlaceholder}
                autoFocus
                kindFilter={
                  phase === "base" ? BASE_LOCATION_KIND_FILTER : undefined
                }
              />
            </motion.div>
          ) : (
            <motion.button
              key="search-trigger"
              type="button"
              onClick={() => setSearchOpen(true)}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? undefined
                  : {
                      opacity: 0,
                      transition: { duration: 0.1, ease: TRIGGER_EASE },
                    }
              }
              transition={{ duration: 0.5, delay: 0.18, ease: TRIGGER_EASE }}
              aria-label={triggerAriaLabel}
              className={cn(
                "group absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                "flex items-baseline justify-center gap-2 pb-1 pt-0.5",
                "bg-transparent px-0 outline-none",
                "text-[14px] leading-snug text-white/55 whitespace-nowrap",
                "transition-colors duration-300 ease-out motion-reduce:transition-none",
                "hover:text-white focus-visible:text-white",
              )}
            >
              <span className="truncate">{triggerLabel}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-x-0 -bottom-0 block h-px bg-white/25",
                  "transition-[background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
                  "group-hover:bg-white/70 group-focus-visible:bg-white/85",
                  "group-hover:[box-shadow:0_0_14px_rgba(255,255,255,0.35)]",
                  "group-focus-visible:[box-shadow:0_0_18px_rgba(255,255,255,0.45)]",
                )}
              />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/*
        Map + selected-locations list as a single editorial stage. On
        `md+` the two live in a flex row — map grows to fill, list is
        a fixed-width right column so entries sit truly *beside* the
        map, not on top of it. On narrow viewports they stack and the
        list drops below the map.
      */}
      <div
        className={cn(
          "flex w-full max-w-6xl flex-col items-stretch gap-6",
          "md:flex-row md:items-start md:gap-8",
        )}
      >
        <motion.div
          layout={reduceMotion ? false : true}
          transition={{ duration: 0.4, ease: TRIGGER_EASE }}
          className="min-w-0 flex-1"
        >
          <ServiceAreaPickerMapPreview
            selected={value}
            className="w-full"
            onClick={() => setSearchOpen(true)}
            baseLocation={baseLocation ?? null}
          />
        </motion.div>

        {phase === "coverage" &&
        (baseLocation || selectedAreas.length > 0) ? (
          <aside
            aria-label="Selected locations"
            className={cn(
              "flex w-full shrink-0 flex-col items-start gap-3 text-left",
              "md:w-52 md:pt-6 lg:w-60",
            )}
          >
            {baseLocation ? (
              // "Based in … · Change" — kept visually quiet so it reads
              // as context, not a primary action. Clicking "Change"
              // drops base_location and the parent flips the H1 back
              // to "Where are you based?".
              <div className="flex w-full flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Based in
                </p>
                <div className="flex w-full items-center gap-2 text-[14px] leading-snug text-white/90">
                  {/*
                    Tiny red/white disc that mirrors the home pin on
                    the map — keeps the "this is your base" visual
                    language consistent across the two surfaces.
                  */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/90 bg-red-500 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {baseLocation.label}
                  </span>
                </div>
                {onClearBaseLocation ? (
                  <button
                    type="button"
                    onClick={() => onClearBaseLocation()}
                    className={cn(
                      "-ml-0.5 w-max bg-transparent p-0 text-[11px] font-medium uppercase tracking-[0.18em] text-white/45 outline-none",
                      "transition-colors duration-200 ease-out motion-reduce:transition-none",
                      "hover:text-white/85 focus-visible:text-white",
                    )}
                  >
                    Change
                  </button>
                ) : null}
              </div>
            ) : null}

            {selectedAreas.length > 0 ? (
              <div className="flex w-full flex-col gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Selected
                </p>
                <ul className="flex w-full flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {selectedAreas.map((a) => (
                      <motion.li
                        key={selectionKey(a)}
                        layout
                        initial={
                          reduceMotion ? false : { opacity: 0, x: 8 }
                        }
                        animate={
                          reduceMotion
                            ? undefined
                            : { opacity: 1, x: 0 }
                        }
                        exit={
                          reduceMotion
                            ? undefined
                            : {
                                opacity: 0,
                                x: 8,
                                transition: { duration: 0.16 },
                              }
                        }
                        transition={{ duration: 0.32, ease: TRIGGER_EASE }}
                        className="w-full"
                      >
                        <div
                          className={cn(
                            "flex w-full items-center gap-2.5 text-left",
                            "text-[14px] leading-snug text-white/90",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              selection.remove(a.provider_id, a.provider)
                            }
                            aria-label={`Remove ${a.label}`}
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center",
                              "-ml-0.5 rounded-full bg-transparent p-0 outline-none",
                              "text-[14px] leading-none text-white/50",
                              "transition-colors duration-200 ease-out motion-reduce:transition-none",
                              "hover:text-white focus-visible:text-white",
                            )}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                          <span className="min-w-0 flex-1 truncate">
                            {a.label}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {customOpen ? (
        <ServiceAreaPickerCustomAreaDialog
          key={customDialogKey}
          open
          onOpenChange={setCustomOpen}
          initialLabel={customDraft}
          onConfirm={handleConfirmCustom}
        />
      ) : null}
    </div>
  );
}
