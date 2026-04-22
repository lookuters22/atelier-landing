/**
 * Deterministic, bounded calendar lookup plan for operator Ana (read-only `calendar_events`).
 * Used by `buildAssistantContext` → `fetchAssistantOperatorCalendarSnapshot`.
 */
import type { AssistantOperatorCalendarLookupMode } from "../types/assistantContext.types.ts";

export const OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS = 60;
/** Default forward rolling window when the query does not imply a narrower range. */
export const OPERATOR_ASSISTANT_CALENDAR_UPCOMING_DAYS = 30;
/** Max history span for explicit / generic past questions (UTC `start_time`). */
export const OPERATOR_ASSISTANT_CALENDAR_HISTORY_BACK_DAYS = 548;
/** Forward span for “next event” style queries. */
export const OPERATOR_ASSISTANT_CALENDAR_FORWARD_CAP_DAYS = 366;
/** Vague past-tense questions without a specific day — lighter back window. */
export const OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS = 180;
/** “Around this wedding” / project-scoped calendar window. */
export const OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS = 365;
export const OPERATOR_ASSISTANT_CALENDAR_PROJECT_FORWARD_DAYS = 120;

export const OPERATOR_ASSISTANT_CONSULT_EVENT_TYPES = ["about_call", "timeline_call"] as const;

export type BuildOperatorCalendarLookupPlanInput = {
  queryText: string;
  now: Date;
  focusedWeddingId: string | null;
  entityResolution: {
    weddingSignal: "none" | "unique" | "ambiguous";
    uniqueWeddingId: string | null;
    queryResolvedProjectFacts: { weddingId: string; couple_names: string; location: string } | null;
  };
  weddingIndexRows: Array<{ id: string; couple_names: string; location: string }>;
};

export type OperatorCalendarLookupPlan = {
  lookupMode: AssistantOperatorCalendarLookupMode;
  lookupBasis: string;
  windowStartIso: string;
  windowEndIso: string;
  windowLabel: string;
  windowDays: number;
  weddingId: string | null;
  coupleNamesForFilter: string | null;
  titleContains: string | null;
  eventTypes: string[] | null;
  orderAscending: boolean;
};

function padIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function startOfUtcDayFromParts(y: number, mo: number, day: number): Date {
  return new Date(Date.UTC(y, mo - 1, day, 0, 0, 0, 0));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function toIso(d: Date): string {
  return d.toISOString();
}

function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const DOW_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Known place tokens for simple location questions (substring match on `title`). */
const PLACE_HINTS = [
  "capri",
  "sorrento",
  "amalfi",
  "positano",
  "sicily",
  "sicilia",
  "tuscany",
  "florence",
  "rome",
  "milan",
  "paris",
  "london",
  "big sur",
] as const;

function parseExplicitYear(q: string): number | null {
  const m = q.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function parseMonthDay(q: string, now: Date, preferPast: boolean): { y: number; m: number; d: number } | null {
  const ql = q.toLowerCase();
  let month: number | undefined;
  let day: number | undefined;
  let year = parseExplicitYear(ql);

  const a = ql.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  if (a) {
    month = MONTH_MAP[a[1]!]!;
    day = Number(a[2]);
  }
  const b = ql.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/,
  );
  if (!month && b) {
    day = Number(b[1]);
    month = MONTH_MAP[b[2]!]!;
  }
  if (!month || !day || day < 1 || day > 31 || month < 1 || month > 12) return null;

  const todayStart = startOfUtcDay(now);

  if (year != null) {
    return { y: year, m: month, d: day };
  }

  let y = now.getUTCFullYear();
  let candidate = startOfUtcDayFromParts(y, month, day);
  if (preferPast) {
    if (candidate >= todayStart) y -= 1;
  } else {
    if (candidate < todayStart) y += 1;
  }
  return { y, m: month, d: day };
}

function utcMondayStart(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const x = startOfUtcDay(d);
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}

function resolveLastWeekday(dow: number, now: Date): Date {
  const x = startOfUtcDay(now);
  let guard = 0;
  x.setUTCDate(x.getUTCDate() - 1);
  while (x.getUTCDay() !== dow && guard < 14) {
    x.setUTCDate(x.getUTCDate() - 1);
    guard += 1;
  }
  return x;
}

function resolveNextWeekday(dow: number, now: Date): Date {
  const x = startOfUtcDay(now);
  let guard = 0;
  if (x.getUTCDay() !== dow) {
    while (x.getUTCDay() !== dow && guard < 14) {
      x.setUTCDate(x.getUTCDate() + 1);
      guard += 1;
    }
  } else {
    x.setUTCDate(x.getUTCDate() + 7);
  }
  return x;
}

function findCoupleNamesFromIndex(weddingId: string, rows: BuildOperatorCalendarLookupPlanInput["weddingIndexRows"]): string | null {
  const w = rows.find((r) => r.id === weddingId);
  const n = w?.couple_names?.trim();
  return n && n.length > 0 ? n : null;
}

function resolveWeddingFilter(input: BuildOperatorCalendarLookupPlanInput): {
  weddingId: string | null;
  coupleNames: string | null;
  basisExtra: string;
} {
  const q = input.queryText;
  const thisProject =
    /\b(this|the)\s+(wedding|project)\b|\baround this wedding\b|\bfor this (wedding|project|couple)\b|\bthis couple'?s?\s+calendar\b/i.test(
      q,
    );
  if (thisProject && input.focusedWeddingId) {
    return {
      weddingId: input.focusedWeddingId,
      coupleNames: null,
      basisExtra: "Scoped to the focused wedding/project.",
    };
  }
  if (input.entityResolution.weddingSignal === "unique" && input.entityResolution.uniqueWeddingId) {
    const wid = input.entityResolution.uniqueWeddingId;
    const names =
      input.entityResolution.queryResolvedProjectFacts?.couple_names?.trim() || findCoupleNamesFromIndex(wid, input.weddingIndexRows);
    return {
      weddingId: wid,
      coupleNames: names && names.length > 0 ? names : null,
      basisExtra: "Scoped to the wedding/project named in the question (single index match).",
    };
  }
  if (input.entityResolution.weddingSignal === "ambiguous") {
    return {
      weddingId: null,
      coupleNames: null,
      basisExtra: "Several projects plausibly match the names in the question — wedding filter omitted.",
    };
  }
  return { weddingId: null, coupleNames: null, basisExtra: "" };
}

function pickTitleContains(queryText: string, weddingRows: BuildOperatorCalendarLookupPlanInput["weddingIndexRows"]): string | null {
  const qn = normalizeQuery(queryText);
  let best: string | null = null;
  let bestLen = 0;
  for (const w of weddingRows) {
    const loc = w.location ?? "";
    for (const part of loc.split(/[,;]/)) {
      const chunk = normalizeQuery(part.trim());
      if (chunk.length < 4) continue;
      if (qn.includes(chunk) && chunk.length > bestLen) {
        best = chunk;
        bestLen = chunk.length;
      }
      for (const token of chunk.split(/\s+/)) {
        if (token.length >= 4 && qn.includes(token) && token.length > bestLen) {
          best = token;
          bestLen = token.length;
        }
      }
    }
  }
  for (const place of PLACE_HINTS) {
    if (qn.includes(place) && place.length > bestLen) {
      best = place;
      bestLen = place.length;
    }
  }
  return best;
}

function wantsConsultFilter(q: string): boolean {
  const s = q.toLowerCase();
  return /\bconsultation|consulting|consult\b/.test(s) || /\babout\s*call\b/.test(s) || /\btimeline\s*call\b/.test(s);
}

/** True when the query names a weekday, calendar month, day-of-month, or relative week — avoid full project-span. */
function hasNarrowTimeToken(q: string): boolean {
  const ql = q.toLowerCase();
  if (/\b(today|tomorrow|yesterday|this week|next week|last week|that week)\b/.test(ql)) return true;
  if (
    /\b(last|next|previous)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b/.test(
      ql,
    )
  ) {
    return true;
  }
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(ql)) return true;
  if (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(
      ql,
    )
  ) {
    return true;
  }
  if (/\b\d{1,2}(?:st|nd|rd|th)?\b/.test(q)) return true;
  return false;
}

/**
 * Builds a single bounded `calendar_events` query description from the operator question + entity hints.
 */
export function buildOperatorCalendarLookupPlan(input: BuildOperatorCalendarLookupPlanInput): OperatorCalendarLookupPlan {
  const { now, queryText } = input;
  const q = String(queryText ?? "").trim();
  const ql = q.toLowerCase();

  const preferPast =
    /\b(was|were|did we|did i|have we had|happened|ago|historical|history|last time|previous time)\b/.test(ql) ||
    /\bwhat was on\b/.test(ql);

  const { weddingId: wfWeddingId, coupleNames: wfCouple, basisExtra: wfBasis } = resolveWeddingFilter(input);
  let weddingId = wfWeddingId;
  let coupleNamesForFilter = wfCouple;
  const titleHint = pickTitleContains(q, input.weddingIndexRows);
  let titleContains = weddingId == null && titleHint != null && /\b(in|at|near|around)\b/.test(ql) ? titleHint : null;
  if (titleContains == null && weddingId == null && titleHint != null && /\b(capri|sorrento|amalfi|positano|sicily|tuscany|florence|rome|paris|london|big sur)\b/i.test(q)) {
    titleContains = titleHint;
  }

  const consultOnly = wantsConsultFilter(q);
  const eventTypes = consultOnly ? [...OPERATOR_ASSISTANT_CONSULT_EVENT_TYPES] : null;

  const basisParts: string[] = [];
  if (wfBasis) basisParts.push(wfBasis);
  if (titleContains) basisParts.push(`Title contains “${titleContains}” (case-insensitive).`);
  if (consultOnly) basisParts.push("Consultation-style event types only (`about_call`, `timeline_call`).");

  /** Default upcoming */
  const upcomingWindow = (): OperatorCalendarLookupPlan => {
    const start = now;
    const end = addUtcDays(startOfUtcDay(now), OPERATOR_ASSISTANT_CALENDAR_UPCOMING_DAYS);
    const basis = basisParts.length > 0 ? basisParts.join(" ") : "Upcoming rolling window.";
    return {
      lookupMode: "upcoming",
      lookupBasis: basis,
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: `${OPERATOR_ASSISTANT_CALENDAR_UPCOMING_DAYS}d forward from snapshot time (UTC)`,
      windowDays: OPERATOR_ASSISTANT_CALENDAR_UPCOMING_DAYS,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  };

  // —— Last / next single-edge ——
  const lastEdge =
    /\b(last|previous|most recent)\b/.test(ql) &&
    /\b(event|call|meeting|appointment|consultation|consult|shoot|booking|session)\b/.test(ql);
  const nextEdge =
    /\b(next|upcoming)\b/.test(ql) &&
    /\b(event|call|meeting|appointment|consultation|consult|shoot|booking|session)\b/.test(ql) &&
    !/\b(next week|this week|last week)\b/.test(ql);

  if (lastEdge) {
    const start = addUtcDays(now, -OPERATOR_ASSISTANT_CALENDAR_HISTORY_BACK_DAYS);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Most recent matching event before snapshot time.";
    return {
      lookupMode: "last_event",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(now),
      windowLabel: `back ${OPERATOR_ASSISTANT_CALENDAR_HISTORY_BACK_DAYS}d until snapshot (UTC)`,
      windowDays: 0,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: false,
    };
  }

  if (nextEdge) {
    const end = addUtcDays(now, OPERATOR_ASSISTANT_CALENDAR_FORWARD_CAP_DAYS);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Next matching event at/after snapshot time.";
    return {
      lookupMode: "next_event",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(now),
      windowEndIso: toIso(end),
      windowLabel: `forward ${OPERATOR_ASSISTANT_CALENDAR_FORWARD_CAP_DAYS}d from snapshot (UTC)`,
      windowDays: 0,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— Week ranges ——
  if (/\bthis week\b/.test(ql)) {
    const mon = utcMondayStart(now);
    const end = addUtcDays(mon, 7);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "UTC week containing snapshot (Mon→Mon).";
    return {
      lookupMode: "date_range",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(mon),
      windowEndIso: toIso(end),
      windowLabel: "this ISO week (UTC Mon start)",
      windowDays: 7,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }
  if (/\blast week\b/.test(ql)) {
    const thisMon = utcMondayStart(now);
    const start = addUtcDays(thisMon, -7);
    const end = thisMon;
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Previous ISO week (UTC Mon→Mon).";
    return {
      lookupMode: "date_range",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: "last ISO week (UTC)",
      windowDays: 7,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }
  if (/\bnext week\b/.test(ql)) {
    const thisMon = utcMondayStart(now);
    const start = addUtcDays(thisMon, 7);
    const end = addUtcDays(thisMon, 14);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Next ISO week (UTC Mon→Mon).";
    return {
      lookupMode: "date_range",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: "next ISO week (UTC)",
      windowDays: 7,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— that week (use current ISO week as weak default) ——
  if (/\bthat week\b/.test(ql)) {
    const mon = utcMondayStart(now);
    const end = addUtcDays(mon, 7);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
      "“That week” interpreted as the ISO week containing snapshot time (UTC).";
    return {
      lookupMode: "date_range",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(mon),
      windowEndIso: toIso(end),
      windowLabel: "ISO week of snapshot (UTC; “that week”)",
      windowDays: 7,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— Weekday names: last thursday / next friday ——
  const lastDow = ql.match(
    /\b(last|previous)\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)\b/,
  );
  if (lastDow) {
    const dow = DOW_MAP[lastDow[2]!]!;
    const day = resolveLastWeekday(dow, now);
    const start = day;
    const end = addUtcDays(day, 1);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + `Specific UTC calendar day (${padIsoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())}).`;
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: `UTC day ${padIsoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())}`,
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }
  const nextDow = ql.match(
    /\b(next)\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)\b/,
  );
  if (nextDow && !/\bnext week\b/.test(ql)) {
    const dow = DOW_MAP[nextDow[2]!]!;
    const day = resolveNextWeekday(dow, now);
    const start = day;
    const end = addUtcDays(day, 1);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + `Specific UTC calendar day (${padIsoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())}).`;
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: `UTC day ${padIsoDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())}`,
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— yesterday / today / tomorrow ——
  if (/\byesterday\b/.test(ql)) {
    const d = addUtcDays(startOfUtcDay(now), -1);
    const start = d;
    const end = addUtcDays(d, 1);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Yesterday (UTC calendar day).";
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: "yesterday (UTC)",
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }
  if (/\btoday\b/.test(ql) && /\b(calendar|schedule|event|on my|anything)\b/.test(ql)) {
    const d = startOfUtcDay(now);
    const end = addUtcDays(d, 1);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Today (UTC calendar day).";
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(d),
      windowEndIso: toIso(end),
      windowLabel: "today (UTC)",
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }
  if (/\btomorrow\b/.test(ql)) {
    const d = addUtcDays(startOfUtcDay(now), 1);
    const end = addUtcDays(d, 1);
    const basis = (basisParts.length > 0 ? basisParts.join(" ") + " " : "") + "Tomorrow (UTC calendar day).";
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(d),
      windowEndIso: toIso(end),
      windowLabel: "tomorrow (UTC)",
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— Month + day ——
  const md = parseMonthDay(q, now, preferPast);
  if (md) {
    const start = startOfUtcDayFromParts(md.y, md.m, md.d);
    const end = addUtcDays(start, 1);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
      `Specific UTC calendar day (${padIsoDate(md.y, md.m, md.d)}).`;
    return {
      lookupMode: "exact_day",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: `UTC day ${padIsoDate(md.y, md.m, md.d)}`,
      windowDays: 1,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— Named / focused project: shorter window when question also names a day/week/month ——
  if (weddingId && hasNarrowTimeToken(q)) {
    if (preferPast) {
      const start = addUtcDays(now, -OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS);
      const basis =
        (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
        `Named project + past-leaning time hint — ${OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS}d back (UTC).`;
      return {
        lookupMode: "recent_history",
        lookupBasis: basis.trim(),
        windowStartIso: toIso(start),
        windowEndIso: toIso(now),
        windowLabel: `${OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS}d back until snapshot`,
        windowDays: OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS,
        weddingId,
        coupleNamesForFilter,
        titleContains,
        eventTypes,
        orderAscending: false,
      };
    }
    return upcomingWindow();
  }

  // —— Named / focused project without a narrower day/week —— ——
  if (weddingId) {
    if (preferPast) {
      const start = addUtcDays(now, -OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS);
      const basis =
        (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
        `Named or focused project — past-schedule window (−${OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS}d UTC; row cap).`;
      return {
        lookupMode: "recent_history",
        lookupBasis: basis.trim(),
        windowStartIso: toIso(start),
        windowEndIso: toIso(now),
        windowLabel: `${OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS}d back until snapshot`,
        windowDays: OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS,
        weddingId,
        coupleNamesForFilter,
        titleContains,
        eventTypes,
        orderAscending: false,
      };
    }
    const end = addUtcDays(now, OPERATOR_ASSISTANT_CALENDAR_PROJECT_FORWARD_DAYS);
    const start = addUtcDays(now, -OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
      `Named or focused project — bounded calendar window (−${OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS}d / +${OPERATOR_ASSISTANT_CALENDAR_PROJECT_FORWARD_DAYS}d UTC; row cap applies).`;
    return {
      lookupMode: "date_range",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(end),
      windowLabel: `project window (−${OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS}d / +${OPERATOR_ASSISTANT_CALENDAR_PROJECT_FORWARD_DAYS}d)`,
      windowDays: OPERATOR_ASSISTANT_CALENDAR_PROJECT_BACK_DAYS + OPERATOR_ASSISTANT_CALENDAR_PROJECT_FORWARD_DAYS,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: true,
    };
  }

  // —— Vague historical ——
  if (preferPast && /\b(calendar|schedule|event|booking|shoot|appointment)\b/.test(ql)) {
    const start = addUtcDays(now, -OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS);
    const basis =
      (basisParts.length > 0 ? basisParts.join(" ") + " " : "") +
      `Recent history (${OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS}d back, UTC).`;
    return {
      lookupMode: "recent_history",
      lookupBasis: basis.trim(),
      windowStartIso: toIso(start),
      windowEndIso: toIso(now),
      windowLabel: `${OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS}d back until snapshot`,
      windowDays: OPERATOR_ASSISTANT_CALENDAR_VAGUE_HISTORY_BACK_DAYS,
      weddingId,
      coupleNamesForFilter,
      titleContains,
      eventTypes,
      orderAscending: false,
    };
  }

  return upcomingWindow();
}
