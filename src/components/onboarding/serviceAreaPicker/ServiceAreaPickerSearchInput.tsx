import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useServiceAreaPickerSearch } from "@/hooks/useServiceAreaPickerSearch.ts";
import type {
  BusinessScopeServiceAreaKind,
  ServiceAreaSearchResult,
} from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import { cn } from "@/lib/utils";

/**
 * Matches `TRIGGER_EASE` in `ServiceAreaPicker.tsx` — the same curve
 * the ghost → input cross-fade uses, so the dropdown uncollapse reads
 * as a single motion with the search bar instead of two stacked
 * transitions.
 */
const LISTBOX_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export type ServiceAreaPickerSearchInputProps = {
  biasCountryCode?: string;
  onSelect: (result: ServiceAreaSearchResult) => void;
  onRequestCustom?: (rawQuery: string) => void;
  className?: string;
  placeholder?: string;
  /**
   * When true, the inner `<input>` takes focus as soon as it mounts
   * and any existing query text is pre-selected. Used by the picker
   * when the ghost trigger / map click expands the search inline so
   * the operator can start typing without an extra click.
   */
  autoFocus?: boolean;
  /**
   * When provided, only search results / suggestions whose `kind` is in
   * the list are surfaced. Used by the picker's "base location" phase
   * to hide `worldwide` / `continent` suggestions (a studio can't be
   * "based on a continent") while still reusing the same search hook.
   */
  kindFilter?: readonly BusinessScopeServiceAreaKind[];
};

export function ServiceAreaPickerSearchInput({
  biasCountryCode,
  onSelect,
  onRequestCustom,
  className,
  placeholder = "Search and select areas",
  autoFocus = false,
  kindFilter,
}: ServiceAreaPickerSearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Imperative focus + select on mount when `autoFocus` is set. This
  // runs after the element is fully in the DOM (post-AnimatePresence
  // mount), which is more reliable than React's built-in `autoFocus`
  // attribute when the component is cross-faded in.
  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Select any existing query text so typing replaces it — no-op
      // on the common "just opened, empty" case, helps if we ever
      // seed the input with a query.
      try {
        el.select();
      } catch {
        /* some browsers throw on empty-value select; safe to ignore */
      }
      setOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);
  const { results: rawResults, suggestions: rawSuggestions, isLoading, error } =
    useServiceAreaPickerSearch({
      query,
      limit: 8,
      biasCountryCode,
    });

  // `kindFilter` is passed down by the picker's base-location phase to
  // prevent `worldwide` / `continent` entries from appearing — those
  // aren't valid answers to "where are you based?". Apply the filter in
  // one place so both the suggestions shortlist and typeahead results
  // respect it identically.
  const allowedKinds = kindFilter ? new Set(kindFilter) : null;
  const results = allowedKinds
    ? rawResults.filter((r) => allowedKinds.has(r.kind))
    : rawResults;
  const suggestions = allowedKinds
    ? rawSuggestions.filter((r) => allowedKinds.has(r.kind))
    : rawSuggestions;

  const trimmed = query.trim();
  /**
   * Empty-query branch: surface a curated "Worldwide / Europe / USA
   * / Italy / France" shortlist so the listbox isn't blank while the
   * user is still deciding what to type. Once they start typing we
   * switch to the real search results.
   */
  const isEmptyQuery = trimmed.length === 0;
  const showSuggestions = isEmptyQuery && suggestions.length > 0;
  const showCustomRow =
    Boolean(onRequestCustom) && trimmed.length >= 3 && results.length === 0 && !isLoading && !error;

  const rows = showSuggestions
    ? (suggestions.map((r) => ({ type: "result" as const, r })) as ReadonlyArray<
        { type: "custom" } | { type: "result"; r: ServiceAreaSearchResult }
      >)
    : showCustomRow
    ? ([{ type: "custom" as const }] as const)
    : (results.map((r) => ({ type: "result" as const, r })) as ReadonlyArray<
        { type: "custom" } | { type: "result"; r: ServiceAreaSearchResult }
      >);

  const displayHighlight = Math.min(highlight, Math.max(0, rows.length - 1));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = useCallback(
    (r: ServiceAreaSearchResult) => {
      onSelect(r);
      setQuery("");
      setOpen(false);
    },
    [onSelect],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(rows.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[displayHighlight];
      if (!row) return;
      if (row.type === "custom") onRequestCustom?.(query.trim());
      else pick(row.r);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full text-left", className)}>
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          scopeInputClass,
        )}
        aria-expanded={open}
        aria-controls="service-area-search-listbox"
        aria-autocomplete="list"
      />
      {error ? (
        <p className="mt-1 text-[12px] text-red-300/90">Could not load area list. Try again later.</p>
      ) : null}
      <AnimatePresence initial={false}>
      {open && (rows.length > 0 || isLoading) ? (
        <motion.ul
          id="service-area-search-listbox"
          role="listbox"
          /*
           * Uncollapse from the search bar: origin pinned to the top
           * edge so the panel appears to "drop out of" the input. We
           * animate height (via scaleY on the shell) + opacity + a
           * small y translate together, matching the TRIGGER_EASE
           * curve the outer shell uses, so the whole thing reads as
           * one continuous motion instead of "input fades in, then
           * dropdown pops".
           */
          initial={reduceMotion ? false : { opacity: 0, y: -6, scaleY: 0.9 }}
          animate={
            reduceMotion
              ? undefined
              : { opacity: 1, y: 0, scaleY: 1 }
          }
          exit={
            reduceMotion
              ? undefined
              : { opacity: 0, y: -4, scaleY: 0.92, transition: { duration: 0.14, ease: LISTBOX_EASE } }
          }
          transition={{ duration: 0.26, ease: LISTBOX_EASE, delay: 0.06 }}
          style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
          className={scopeListboxClass}
        >
          {isLoading ? (
            <li className="px-3 py-2.5 text-[13px] leading-snug text-white/60">Loading…</li>
          ) : (
            <>
              {showSuggestions ? (
                <li
                  role="presentation"
                  className="select-none px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40"
                >
                  Suggestions
                </li>
              ) : null}
              {rows.map((row, i) => {
                const active = i === displayHighlight;
                return (
                  <li
                    key={row.type === "custom" ? "custom" : row.r.provider_id}
                    role="presentation"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "flex w-full cursor-pointer px-3 py-2.5 text-left text-[13px] leading-snug transition-colors",
                        active ? "bg-white/14 text-white" : "text-white/90 hover:bg-white/8",
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        if (row.type === "custom") onRequestCustom?.(query.trim());
                        else pick(row.r);
                      }}
                    >
                      {row.type === "custom" ? (
                        <span>Use “{query.trim()}” as custom area…</span>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-baseline gap-2">
                          <span className="truncate">{row.r.label}</span>
                          <span className="shrink-0 text-[11px] uppercase tracking-wide text-white/45">
                            {row.r.kind}
                            {row.r.country_code ? ` · ${row.r.country_code}` : ""}
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </motion.ul>
      ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Matches onboarding Identity / CinematicGlassSelect input + portal listbox styling. */
const scopeInputClass =
  "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[14px] leading-snug text-white placeholder:text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-[20px] transition-[background,border-color] focus:border-white/45 focus:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-white/15 sm:text-[15px]";

const scopeListboxClass =
  "absolute z-[100] mt-2 max-h-[min(18rem,50vh)] w-full overflow-auto rounded-xl border border-white/20 bg-white/10 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_-16px_rgba(0,0,0,0.4)] backdrop-blur-[20px]";
