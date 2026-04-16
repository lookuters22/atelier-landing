import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import { obFieldHint, obIdentityGlassInput, obInput, obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import {
  IDENTITY_MICROFLOW_FIELDS,
  initialIdentityMicroflowIndex,
  type IdentityMicroflowField,
  type IdentityMicroflowFieldId,
} from "@/components/onboarding/onboardingIdentityMicroflow.ts";
import { cn } from "@/lib/utils";

/** Cinematic identity — physics-based easing (fade & glide). */
const CINEMATIC_TEXT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Inline dropdown (non-portal) */
const identityGlassList =
  "absolute z-[100] mt-2 max-h-[min(18rem,50vh)] w-full overflow-auto rounded-xl border border-white/20 bg-white/10 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_-16px_rgba(0,0,0,0.4)] backdrop-blur-[20px]";

/** Portal dropdown — escapes stacking contexts so nav never covers the list */
const identityGlassListFixed =
  "fixed z-[10000] max-h-[min(18rem,50vh)] overflow-auto rounded-xl border border-white/20 bg-white/10 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_-16px_rgba(0,0,0,0.4)] backdrop-blur-[20px]";

function useAnchorRect(anchorRef: RefObject<HTMLElement | null>, open: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    const update = () => {
      const next = anchorRef.current?.getBoundingClientRect();
      if (next) setRect(next);
    };
    update();
    let raf = 0;
    if (!anchorRef.current) {
      raf = requestAnimationFrame(() => update());
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  return rect;
}

const PLACEHOLDER_TYPEWRITER_EXAMPLES: Record<IdentityMicroflowFieldId, string[]> = {
  studio_name: ["Atelier Elena Duarte...", "Stellar Studios...", "The Archive...", "Noir & Sage..."],
  currency: ["EUR…", "Search dollar or GBP…", "Try EUR or USD…"],
  timezone: ["London or Paris…", "Search +01:00 or city…", "Europe/Belgrade…"],
  manager_name: ["Elena Duarte...", "Jordan Kim...", "Alex Rivera..."],
  photographer_names: ["Elena & Marco...", "The collective…", "Studio team…"],
  admin_mobile_number: ["+1 555 010 1234...", "+44 20 7123 4567...", "+381 60 123 4567..."],
};

function useCinematicTypewriterPlaceholder(fieldId: IdentityMicroflowFieldId, enabled: boolean): string {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDisplay("");
      return;
    }
    const examples = PLACEHOLDER_TYPEWRITER_EXAMPLES[fieldId];
    let cancelled = false;
    let exIdx = 0;
    let charIdx = 0;
    let tid: ReturnType<typeof setTimeout> | undefined;
    let startDelay: ReturnType<typeof setTimeout>;

    const typeLoop = () => {
      if (cancelled) return;
      const full = examples[exIdx % examples.length]!;
      if (charIdx < full.length) {
        setDisplay(full.slice(0, charIdx + 1));
        charIdx++;
        tid = setTimeout(typeLoop, 88);
        return;
      }
      tid = setTimeout(() => {
        charIdx = 0;
        exIdx++;
        setDisplay("");
        typeLoop();
      }, 2000);
    };

    startDelay = setTimeout(() => {
      if (!cancelled) typeLoop();
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(startDelay);
      if (tid) clearTimeout(tid);
    };
  }, [fieldId, enabled]);

  return display;
}

/** Allowlist rows — stored value is ISO code; UI matches timezone combobox (code + label). */
const CURRENCY_OPTIONS = [
  { value: "EUR", code: "EUR", name: "Euro" },
  { value: "USD", code: "USD", name: "US Dollar" },
  { value: "GBP", code: "GBP", name: "British Pound" },
  { value: "CHF", code: "CHF", name: "Swiss Franc" },
  { value: "SEK", code: "SEK", name: "Swedish Krona" },
  { value: "NOK", code: "NOK", name: "Norwegian Krone" },
  { value: "DKK", code: "DKK", name: "Danish Krone" },
  { value: "AUD", code: "AUD", name: "Australian Dollar" },
  { value: "CAD", code: "CAD", name: "Canadian Dollar" },
] as const;

const CURRENCY_CODE_SET = new Set<string>(CURRENCY_OPTIONS.map((o) => o.value));

type CurrencyOptionRow = { value: string; code: string; name: string };

function displayLabelForStoredCurrency(stored: string | undefined): string {
  const t = stored?.trim() ?? "";
  if (!t) return "";
  const upper = t.toUpperCase();
  if (CURRENCY_CODE_SET.has(upper)) {
    const row = CURRENCY_OPTIONS.find((o) => o.value === upper);
    return row ? `${row.code} — ${row.name}` : upper;
  }
  return t;
}

function currencyMatchesQuery(row: CurrencyOptionRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${row.code} ${row.name}`.toLowerCase();
  if (hay.includes(needle)) return true;
  const compact = needle.replace(/\s+/g, "");
  if (compact && hay.replace(/\s+/g, "").includes(compact)) return true;
  return false;
}

function filterCurrencyOptions(query: string): CurrencyOptionRow[] {
  const q = query.trim();
  if (!q) return CURRENCY_OPTIONS.slice();
  return CURRENCY_OPTIONS.filter((o) => currencyMatchesQuery(o, q));
}

/** Curated “Essential 30” — stored value is IANA; label is fixed copy for scanning. */
const ESSENTIAL_TIMEZONES = [
  { value: "Pacific/Midway", label: "(UTC-11:00) Midway Island, Samoa" },
  { value: "America/Adak", label: "(UTC-10:00) Hawaii-Aleutian" },
  { value: "America/Anchorage", label: "(UTC-09:00) Alaska" },
  { value: "America/Los_Angeles", label: "(UTC-08:00) Pacific Time (US & Canada)" },
  { value: "America/Denver", label: "(UTC-07:00) Mountain Time (US & Canada)" },
  { value: "America/Chicago", label: "(UTC-06:00) Central Time (US & Canada)" },
  { value: "America/New_York", label: "(UTC-05:00) Eastern Time (US & Canada)" },
  { value: "America/Halifax", label: "(UTC-04:00) Atlantic Time (Canada)" },
  { value: "America/Argentina/Buenos_Aires", label: "(UTC-03:00) Buenos Aires, Georgetown" },
  { value: "America/Noronha", label: "(UTC-02:00) Mid-Atlantic" },
  { value: "Atlantic/Azores", label: "(UTC-01:00) Azores, Cape Verde Is." },
  { value: "Europe/London", label: "(UTC+00:00) London, Dublin, Lisbon" },
  { value: "Europe/Belgrade", label: "(UTC+01:00) Belgrade, Berlin, Paris, Rome" },
  { value: "Europe/Helsinki", label: "(UTC+02:00) Helsinki, Kyiv, Cairo" },
  { value: "Europe/Moscow", label: "(UTC+03:00) Moscow, Istanbul, Nairobi" },
  { value: "Asia/Dubai", label: "(UTC+04:00) Abu Dhabi, Muscat, Baku" },
  { value: "Asia/Karachi", label: "(UTC+05:00) Islamabad, Karachi, Tashkent" },
  { value: "Asia/Kolkata", label: "(UTC+05:30) Chennai, Kolkata, Mumbai" },
  { value: "Asia/Dhaka", label: "(UTC+06:00) Astana, Dhaka" },
  { value: "Asia/Bangkok", label: "(UTC+07:00) Bangkok, Hanoi, Jakarta" },
  { value: "Asia/Shanghai", label: "(UTC+08:00) Beijing, Hong Kong, Singapore" },
  { value: "Asia/Tokyo", label: "(UTC+09:00) Osaka, Sapporo, Tokyo" },
  { value: "Australia/Darwin", label: "(UTC+09:30) Adelaide, Darwin" },
  { value: "Australia/Sydney", label: "(UTC+10:00) Sydney, Melbourne, Brisbane" },
  { value: "Asia/Magadan", label: "(UTC+11:00) Magadan, Solomon Is." },
  { value: "Pacific/Auckland", label: "(UTC+12:00) Auckland, Wellington, Fiji" },
] as const;

const ESSENTIAL_VALUE_SET = new Set<string>(ESSENTIAL_TIMEZONES.map((e) => e.value));

const ALL_IANA_TIMEZONES: readonly string[] = (() => {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone").slice().sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }
  return ESSENTIAL_TIMEZONES.map((e) => e.value);
})();

const ALL_IANA_SET = new Set(ALL_IANA_TIMEZONES);

function formatUtcOffsetParenthetical(timeZone: string, date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const raw = dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "(UTC)";
  const sign = m[1];
  const hh = m[2]!.padStart(2, "0");
  const mm = (m[3] ?? "00").padStart(2, "0");
  return `(UTC${sign}${hh}:${mm})`;
}

function humanizeIana(timeZone: string): string {
  return timeZone.replace(/\//g, " · ").replace(/_/g, " ");
}

type TimezoneOption = { value: string; label: string; essential?: boolean };

const EXTENDED_TIMEZONE_OPTIONS: readonly TimezoneOption[] = ALL_IANA_TIMEZONES.filter((id) => !ESSENTIAL_VALUE_SET.has(id)).map(
  (value) => ({
    value,
    label: `${formatUtcOffsetParenthetical(value)} ${humanizeIana(value)}`,
    essential: false,
  }),
);

const LABEL_BY_IANA = new Map<string, string>();
for (const row of ESSENTIAL_TIMEZONES) {
  LABEL_BY_IANA.set(row.value, row.label);
}
for (const row of EXTENDED_TIMEZONE_OPTIONS) {
  LABEL_BY_IANA.set(row.value, row.label);
}

function displayLabelForStoredTimezone(iana: string): string {
  const t = iana.trim();
  if (!t) return "";
  const known = LABEL_BY_IANA.get(t);
  if (known) return known;
  return `${formatUtcOffsetParenthetical(t)} ${humanizeIana(t)}`;
}

function timezoneMatchesQuery(option: TimezoneOption, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${option.value} ${option.label}`.toLowerCase();
  if (hay.includes(needle)) return true;
  const compact = needle.replace(/\s+/g, "");
  if (compact && hay.replace(/\s+/g, "").includes(compact)) return true;
  return false;
}

function filterTimezoneOptions(query: string): TimezoneOption[] {
  const q = query.trim();
  if (!q) {
    return ESSENTIAL_TIMEZONES.map((e) => ({ ...e, essential: true }));
  }
  const fromEssential = ESSENTIAL_TIMEZONES.filter((e) => timezoneMatchesQuery({ value: e.value, label: e.label }, q)).map((e) => ({
    ...e,
    essential: true,
  }));
  const fromExtended = EXTENDED_TIMEZONE_OPTIONS.filter((e) => timezoneMatchesQuery(e, q));
  const seen = new Set<string>();
  const out: TimezoneOption[] = [];
  for (const o of [...fromEssential, ...fromExtended]) {
    if (seen.has(o.value)) continue;
    seen.add(o.value);
    out.push(o);
  }
  return out;
}

function promptSupportCopy(fieldId: IdentityMicroflowFieldId): string {
  switch (fieldId) {
    case "studio_name":
      return "This anchors signatures, summaries, and how Ana frames the studio.";
    case "currency":
      return "Keep this standardized so pricing and billing language stay clean.";
    case "timezone":
      return "Used for scheduling, reminders, and time-sensitive workflows.";
    case "manager_name":
      return "The human name Ana can reference when context calls for it.";
    case "photographer_names":
      return "Helpful for signatures and natural references to the team.";
    case "admin_mobile_number":
      return "Used only for operator-side escalation and urgent studio coordination.";
  }
}

export type OnboardingBriefingIdentityStepProps = {
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  onAdvanceStep: () => void;
};

function identityFieldValueEmpty(field: IdentityMicroflowField, sid: NonNullable<OnboardingPayloadV4["settings_identity"]>): boolean {
  switch (field.id) {
    case "studio_name":
      return !sid.studio_name?.trim();
    case "currency":
      return !sid.currency?.trim();
    case "timezone":
      return !sid.timezone?.trim();
    case "manager_name":
      return !sid.manager_name?.trim();
    case "photographer_names":
      return !sid.photographer_names?.trim();
    case "admin_mobile_number":
      return !sid.admin_mobile_number?.trim();
    default:
      return true;
  }
}

export function OnboardingBriefingIdentityStep({
  payload,
  updatePayload,
  onAdvanceStep,
}: OnboardingBriefingIdentityStepProps) {
  const id = payload.settings_identity;

  const getVal = (k: IdentityMicroflowFieldId) => {
    switch (k) {
      case "studio_name":
        return id.studio_name;
      case "currency":
        return id.currency;
      case "timezone":
        return id.timezone;
      case "manager_name":
        return id.manager_name;
      case "photographer_names":
        return id.photographer_names;
      case "admin_mobile_number":
        return id.admin_mobile_number;
    }
  };

  const [activeIndex, setActiveIndex] = useState(() => initialIdentityMicroflowIndex(getVal));
  const identityStepRef = useRef<HTMLDivElement>(null);

  const total = IDENTITY_MICROFLOW_FIELDS.length;
  const last = total - 1;
  const activeField = IDENTITY_MICROFLOW_FIELDS[activeIndex]!;

  const valueEmpty = identityFieldValueEmpty(activeField, id);
  const animatedPlaceholder = useCinematicTypewriterPlaceholder(activeField.id, valueEmpty);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = identityStepRef.current?.querySelector<HTMLElement>("input, select, textarea");
      if (el && typeof el.focus === "function") {
        el.focus();
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [activeIndex]);

  function patchIdentity(patch: Partial<NonNullable<typeof id>>) {
    updatePayload((prev) => ({
      ...prev,
      settings_identity: { ...prev.settings_identity, ...patch },
    }));
  }

  useEffect(() => {
    if (activeField.id !== "timezone") return;
    if (id.timezone?.trim()) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    updatePayload((prev) => ({
      ...prev,
      settings_identity: { ...prev.settings_identity, timezone: detected },
    }));
  }, [activeField.id, id.timezone, updatePayload]);
  const answeredCount = IDENTITY_MICROFLOW_FIELDS.reduce((count, field) => {
    const value = getVal(field.id)?.trim();
    return value ? count + 1 : count;
  }, 0);

  function handleAdvance() {
    if (activeIndex < last) {
      setActiveIndex((j) => Math.min(last, j + 1));
      return;
    }

    onAdvanceStep();
  }

  return (
    <div className="cinematic-onboarding relative flex min-h-[min(82vh,880px)] w-full max-w-4xl flex-col items-center justify-center px-4 text-center sm:px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeField.id}
          ref={identityStepRef}
          role="group"
          aria-labelledby={`identity-prompt-${activeField.id}`}
          className="overlay-content flex w-full flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.28, ease: obMotionShell.ease }}
        >
          <div className="question-header mb-10 flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 text-left sm:mb-12">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Identity</p>
              <p className="mt-1 text-[12px] text-white/45">{answeredCount} answered so far</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {IDENTITY_MICROFLOW_FIELDS.map((field, i) => (
                  <span
                    key={field.id}
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      i === activeIndex
                        ? "bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
                        : "bg-white/25",
                    )}
                  />
                ))}
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">
                {activeIndex + 1} of {total}
              </span>
            </div>
          </div>

          <motion.h1
            id={`identity-prompt-${activeField.id}`}
            className="max-w-[34rem] font-serif text-[clamp(1.65rem,4.2vw,2.55rem)] font-normal leading-[1.08] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: CINEMATIC_TEXT_EASE }}
          >
            {activeField.prompt}
          </motion.h1>

          <motion.p
            className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/72 sm:mt-5 sm:text-[14px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28, ease: CINEMATIC_TEXT_EASE }}
          >
            {promptSupportCopy(activeField.id)}
          </motion.p>

          <motion.div
            className="input-reveal-zone relative z-30 mt-10 w-full max-w-lg sm:mt-12"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 1, ease: [0.22, 0.68, 0.35, 1] }}
          >
            <div className="input-wrapper relative z-30 w-full">
              <IdentityFieldControl
                field={activeField}
                id={id}
                patchIdentity={patchIdentity}
                cinematic
                animatedPlaceholder={animatedPlaceholder}
              />
            </div>
          </motion.div>

          <motion.div
            className="navigation-reveal relative z-10 mt-10 flex w-full max-w-lg flex-wrap items-center justify-between gap-4 sm:mt-11"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.12, ease: obMotionShell.ease }}
          >
            <button
              type="button"
              className="text-[13px] font-medium text-white/50 transition-colors hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={activeIndex <= 0}
              onClick={() => setActiveIndex((j) => Math.max(0, j - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-full border border-white/35 bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[background,border-color] hover:border-white/50 hover:bg-white/16"
              onClick={handleAdvance}
            >
              {activeIndex < last ? "Next" : "Continue"}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function parseTimezoneLabelParts(label: string): { offset: string; cities: string } {
  const m = label.match(/^\((UTC[+-][\d:]+)\)\s*(.+)$/);
  if (m) return { offset: `(${m[1]})`, cities: m[2]!.trim() };
  return { offset: "", cities: label };
}

function TimezoneSearchCombobox({
  value,
  onChange,
  cinematic,
  animatedPlaceholder,
}: {
  value: string | undefined;
  onChange: (iana: string | undefined) => void;
  cinematic?: boolean;
  animatedPlaceholder?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listPortalRef = useRef<HTMLUListElement>(null);

  const selected = value?.trim() ?? "";
  const selectedLabelText = selected ? displayLabelForStoredTimezone(selected) : "";

  const options = useMemo(() => {
    let list = filterTimezoneOptions(query);
    if (selected && !ALL_IANA_SET.has(selected)) {
      const syn: TimezoneOption = {
        value: selected,
        label: `Saved: ${displayLabelForStoredTimezone(selected)}`,
      };
      if (!query.trim() || timezoneMatchesQuery({ value: syn.value, label: syn.label }, query)) {
        list = [syn, ...list];
      }
    }
    return list;
  }, [query, selected]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    setHighlighted((h) => {
      if (options.length === 0) return 0;
      return Math.min(h, options.length - 1);
    });
  }, [options.length]);

  const anchorRect = useAnchorRect(inputRef, open && !!cinematic);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (listPortalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = useCallback(
    (iana: string) => {
      const next = iana.trim();
      onChange(next.length ? next : undefined);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const showInputValue = open ? query : selectedLabelText;

  const timezoneListItems =
    options.length === 0 ? (
      <li
        className={cn(
          "px-3 py-2.5 text-[13px]",
          cinematic ? "text-white/50" : "text-stone-500 dark:text-stone-400",
        )}
      >
        No matches
      </li>
    ) : (
      options.map((opt, i) => {
        const { offset, cities } = parseTimezoneLabelParts(opt.label);
        const active = i === highlighted;
        return (
          <li key={opt.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={cn(
                "flex w-full cursor-pointer gap-3 px-3 py-2.5 text-left transition-colors",
                cinematic
                  ? active
                    ? "bg-white/14"
                    : "hover:bg-white/8"
                  : active
                    ? "bg-[#e8e2d8]/90 dark:bg-stone-800/90"
                    : "hover:bg-[#f1ebe7] dark:hover:bg-stone-800/60",
              )}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt.value)}
            >
              {offset ? (
                <span
                  className={cn(
                    "min-w-[5.75rem] shrink-0 text-[13px] font-semibold",
                    cinematic ? "text-[#c5d4b8]" : "text-[#5c6654] dark:text-[#9aaa8e]",
                  )}
                >
                  {offset}
                </span>
              ) : null}
              <span
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-snug",
                  cinematic ? "text-white/90" : "text-stone-800 dark:text-stone-200",
                  !offset && "pl-0.5",
                )}
              >
                {offset ? cities : opt.label}
              </span>
            </button>
          </li>
        );
      })
    );

  return (
    <div ref={wrapperRef} className={cn("relative", cinematic && "z-50")}>
      <label htmlFor={inputId} className="sr-only">
        Studio timezone
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        autoComplete="off"
        className={cinematic ? obIdentityGlassInput : obInput}
        placeholder={
          cinematic ? (animatedPlaceholder ?? "Search city or offset…") : "Search city or offset (e.g. +01:00)..."
        }
        value={showInputValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            e.preventDefault();
            return;
          }
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              setOpen(true);
              setQuery("");
              e.preventDefault();
            }
            return;
          }
          if (e.key === "ArrowDown") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.min(options.length - 1, h + 1));
            e.preventDefault();
            return;
          }
          if (e.key === "ArrowUp") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.max(0, h - 1));
            e.preventDefault();
            return;
          }
          if (e.key === "Enter" && options[highlighted]) {
            pick(options[highlighted]!.value);
            e.preventDefault();
          }
        }}
      />
      {open && !cinematic ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-[min(18rem,50vh)] w-full overflow-auto rounded-lg border border-[#c4b8a8] bg-[#fdfcfa] py-1 shadow-[0_12px_40px_-12px_rgba(40,32,24,0.25)] dark:border-stone-600 dark:bg-stone-900/98"
        >
          {timezoneListItems}
        </ul>
      ) : null}
      {open && cinematic && anchorRect
        ? createPortal(
            <ul
              ref={listPortalRef}
              id={listboxId}
              role="listbox"
              className={identityGlassListFixed}
              style={{
                top: anchorRect.bottom + 8,
                left: anchorRect.left,
                width: anchorRect.width,
                zIndex: 10000,
              }}
            >
              {timezoneListItems}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

function CurrencySearchCombobox({
  value,
  onChange,
  cinematic,
  animatedPlaceholder,
}: {
  value: string | undefined;
  onChange: (code: string | undefined) => void;
  cinematic?: boolean;
  animatedPlaceholder?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-currency-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listPortalRef = useRef<HTMLUListElement>(null);

  const selectedRaw = value?.trim() ?? "";
  const selectedLabelText = selectedRaw ? displayLabelForStoredCurrency(value) : "";

  const options = useMemo(() => {
    let list = filterCurrencyOptions(query);
    if (selectedRaw && !CURRENCY_CODE_SET.has(selectedRaw.toUpperCase())) {
      const syn: CurrencyOptionRow = {
        value: selectedRaw,
        code: "",
        name: `Saved: ${selectedRaw}`,
      };
      const hay = `${syn.value} ${syn.name}`.toLowerCase();
      const needle = query.trim().toLowerCase();
      const matches =
        !needle ||
        hay.includes(needle) ||
        (needle.replace(/\s+/g, "") && hay.replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")));
      if (matches) list = [{ value: syn.value, code: "", name: syn.name }, ...list];
    }
    return list;
  }, [query, selectedRaw]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    setHighlighted((h) => {
      if (options.length === 0) return 0;
      return Math.min(h, options.length - 1);
    });
  }, [options.length]);

  const anchorRect = useAnchorRect(inputRef, open && !!cinematic);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (listPortalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = useCallback(
    (code: string) => {
      const next = code.trim();
      if (!next) {
        onChange(undefined);
      } else if (CURRENCY_CODE_SET.has(next.toUpperCase())) {
        onChange(next.toUpperCase());
      } else {
        onChange(next);
      }
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const showInputValue = open ? query : selectedLabelText;

  const currencyListItems =
    options.length === 0 ? (
      <li
        className={cn(
          "px-3 py-2.5 text-[13px]",
          cinematic ? "text-white/50" : "text-stone-500 dark:text-stone-400",
        )}
      >
        No matches
      </li>
    ) : (
      options.map((opt, i) => {
        const active = i === highlighted;
        const legacyRow = !opt.code;
        return (
          <li key={`${opt.value}-${i}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={cn(
                "flex w-full cursor-pointer gap-3 px-3 py-2.5 text-left transition-colors",
                cinematic
                  ? active
                    ? "bg-white/14"
                    : "hover:bg-white/8"
                  : active
                    ? "bg-[#e8e2d8]/90 dark:bg-stone-800/90"
                    : "hover:bg-[#f1ebe7] dark:hover:bg-stone-800/60",
              )}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt.value)}
            >
              {legacyRow ? (
                <span
                  className={cn(
                    "min-w-0 flex-1 pl-0.5 text-[13px] leading-snug",
                    cinematic ? "text-white/90" : "text-stone-800 dark:text-stone-200",
                  )}
                >
                  {opt.name}
                </span>
              ) : (
                <>
                  <span
                    className={cn(
                      "min-w-[3.25rem] shrink-0 text-[13px] font-semibold tabular-nums",
                      cinematic ? "text-[#c5d4b8]" : "text-[#5c6654] dark:text-[#9aaa8e]",
                    )}
                  >
                    {opt.code}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[13px] leading-snug",
                      cinematic ? "text-white/90" : "text-stone-800 dark:text-stone-200",
                    )}
                  >
                    {opt.name}
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })
    );

  return (
    <div ref={wrapperRef} className={cn("relative", cinematic && "z-50")}>
      <label htmlFor={inputId} className="sr-only">
        Currency
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        autoComplete="off"
        className={cinematic ? obIdentityGlassInput : obInput}
        placeholder={
          cinematic ? (animatedPlaceholder ?? "Search code or name…") : "Search code or name (e.g. EUR, dollar)..."
        }
        value={showInputValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            e.preventDefault();
            return;
          }
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              setOpen(true);
              setQuery("");
              e.preventDefault();
            }
            return;
          }
          if (e.key === "ArrowDown") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.min(options.length - 1, h + 1));
            e.preventDefault();
            return;
          }
          if (e.key === "ArrowUp") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.max(0, h - 1));
            e.preventDefault();
            return;
          }
          if (e.key === "Enter" && options[highlighted]) {
            pick(options[highlighted]!.value);
            e.preventDefault();
          }
        }}
      />
      {open && !cinematic ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-[min(18rem,50vh)] w-full overflow-auto rounded-lg border border-[#c4b8a8] bg-[#fdfcfa] py-1 shadow-[0_12px_40px_-12px_rgba(40,32,24,0.25)] dark:border-stone-600 dark:bg-stone-900/98"
        >
          {currencyListItems}
        </ul>
      ) : null}
      {open && cinematic && anchorRect
        ? createPortal(
            <ul
              ref={listPortalRef}
              id={listboxId}
              role="listbox"
              className={identityGlassListFixed}
              style={{
                top: anchorRect.bottom + 8,
                left: anchorRect.left,
                width: anchorRect.width,
                zIndex: 10000,
              }}
            >
              {currencyListItems}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

function IdentityFieldControl({
  field,
  id,
  patchIdentity,
  cinematic,
  animatedPlaceholder,
}: {
  field: IdentityMicroflowField;
  id: NonNullable<OnboardingPayloadV4["settings_identity"]>;
  patchIdentity: (patch: Partial<NonNullable<OnboardingPayloadV4["settings_identity"]>>) => void;
  cinematic?: boolean;
  animatedPlaceholder?: string;
}) {
  const hint = field.hint ? (
    <span className={cinematic ? "mt-2 block text-[11px] leading-relaxed text-white/55" : obFieldHint}>{field.hint}</span>
  ) : null;
  const inputCls = cinematic ? obIdentityGlassInput : obInput;

  switch (field.id) {
    case "studio_name":
      return (
        <label className="block space-y-2">
          <span className="sr-only">{field.shortLabel}</span>
          <input
            className={inputCls}
            value={id.studio_name ?? ""}
            onChange={(e) => patchIdentity({ studio_name: e.target.value })}
            placeholder={cinematic ? (animatedPlaceholder ?? "") : "Atelier · Elena Duarte"}
            spellCheck={false}
            autoComplete="organization"
          />
        </label>
      );
    case "currency":
      return (
        <CurrencySearchCombobox
          value={id.currency}
          onChange={(code) => patchIdentity({ currency: code })}
          cinematic={cinematic}
          animatedPlaceholder={animatedPlaceholder}
        />
      );
    case "timezone":
      return (
        <TimezoneSearchCombobox
          value={id.timezone}
          onChange={(iana) => patchIdentity({ timezone: iana })}
          cinematic={cinematic}
          animatedPlaceholder={animatedPlaceholder}
        />
      );
    case "manager_name":
      return (
        <label className="block space-y-2">
          <span className="sr-only">Name</span>
          <input
            className={inputCls}
            value={id.manager_name ?? ""}
            onChange={(e) => patchIdentity({ manager_name: e.target.value })}
            placeholder={cinematic ? (animatedPlaceholder ?? "") : "Elena Duarte"}
            autoComplete="name"
          />
        </label>
      );
    case "photographer_names":
      return (
        <label className="block space-y-2">
          <span className="sr-only">Names</span>
          <input
            className={inputCls}
            value={id.photographer_names ?? ""}
            onChange={(e) => patchIdentity({ photographer_names: e.target.value })}
            placeholder={cinematic ? (animatedPlaceholder ?? "") : "Elena & Marco"}
            autoComplete="off"
          />
        </label>
      );
    case "admin_mobile_number":
      return (
        <label className="block space-y-2">
          <span className="sr-only">Phone (E.164)</span>
          <input
            className={inputCls}
            value={id.admin_mobile_number ?? ""}
            onChange={(e) => patchIdentity({ admin_mobile_number: e.target.value.trim() || undefined })}
            placeholder={cinematic ? (animatedPlaceholder ?? "") : "+381601234567"}
            inputMode="tel"
            autoComplete="tel"
          />
          {hint}
        </label>
      );
    default:
      return null;
  }
}
