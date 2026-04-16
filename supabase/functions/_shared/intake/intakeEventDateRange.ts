/**
 * Deterministic multi-day wedding date enrichment on top of LLM extraction.
 * Collapse happens when only `wedding_date` exists and the model picks a single day from a range.
 */
import type { IntakeStructuredExtraction } from "./intakeBootstrapTypes.ts";

const MONTH_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function utcDate(y: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(y, monthIndex, day, 12, 0, 0));
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  return t;
}

function normalizeIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Parse patterns like "August 20–22, 2027", "Aug 20-22, 2027", "20-22 August 2027".
 */
export function tryParseMultiDayRangeFromText(text: string): { startIso: string; endIso: string } | null {
  const flat = String(text ?? "")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .trim();
  if (!flat) return null;

  let m = flat.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*[-]\s*(\d{1,2}),?\s*(\d{4})\b/i,
  );
  if (m) {
    const monthIdx = MONTH_TO_INDEX[m[1].toLowerCase()];
    if (monthIdx === undefined) return null;
    const y = parseInt(m[4], 10);
    const d1 = parseInt(m[2], 10);
    const d2 = parseInt(m[3], 10);
    const start = utcDate(y, monthIdx, d1);
    const end = utcDate(y, monthIdx, d2);
    if (end.getTime() < start.getTime()) return null;
    if (d1 === d2) return null;
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  m = flat.match(
    /\b(\d{1,2})\s*[-]\s*(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  );
  if (m) {
    const monthIdx = MONTH_TO_INDEX[m[3].toLowerCase()];
    if (monthIdx === undefined) return null;
    const y = parseInt(m[4], 10);
    const d1 = parseInt(m[1], 10);
    const d2 = parseInt(m[2], 10);
    const start = utcDate(y, monthIdx, d1);
    const end = utcDate(y, monthIdx, d2);
    if (end.getTime() < start.getTime()) return null;
    if (d1 === d2) return null;
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  return null;
}

/** "Ceremony on the 21st" / "wedding ceremony Saturday 21 August" — pick calendar day within a known range month/year. */
function tryParseExplicitCeremonyDayIso(text: string, rangeStart: Date, rangeEnd: Date): string | null {
  const t = String(text ?? "").toLowerCase();
  const yS = rangeStart.getUTCFullYear();
  const mS = rangeStart.getUTCMonth();
  const yE = rangeEnd.getUTCFullYear();
  const mE = rangeEnd.getUTCMonth();
  if (yS !== yE || mS !== mE) return null;

  const cer = /\b(?:ceremony|wedding\s+ceremony|vows)\b[^.]{0,120}/i.exec(String(text ?? ""));
  if (!cer) return null;
  const segment = cer[0];
  const dayM = segment.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (!dayM) return null;
  const day = parseInt(dayM[1], 10);
  const startD = rangeStart.getUTCDate();
  const endD = rangeEnd.getUTCDate();
  if (day < startD || day > endD) return null;
  const iso = utcDate(yS, mS, day).toISOString();
  return iso;
}

type RawParsed = Partial<IntakeStructuredExtraction> & {
  ceremony_date?: unknown;
};

/**
 * Merges model output + deterministic range/ceremony hints into normalized extraction.
 */
export function enrichIntakeStructuredExtraction(
  rawMessage: string,
  parsed: RawParsed,
): IntakeStructuredExtraction {
  const ceremonyDate = normalizeIso(parsed.ceremony_date);
  let weddingDate = normalizeIso(parsed.wedding_date);
  let eventStart = normalizeIso(parsed.event_start_date);
  let eventEnd = normalizeIso(parsed.event_end_date);

  const fromText = tryParseMultiDayRangeFromText(rawMessage);
  if (fromText) {
    if (!eventStart) eventStart = fromText.startIso;
    if (!eventEnd) eventEnd = fromText.endIso;
  }

  if (eventStart && eventEnd) {
    const s = new Date(eventStart);
    const e = new Date(eventEnd);
    if (e.getTime() < s.getTime()) {
      const swap = eventStart;
      eventStart = eventEnd;
      eventEnd = swap;
    }
  }

  if (eventStart && eventEnd && eventStart === eventEnd) {
    eventEnd = null;
    eventStart = null;
  }

  const multi =
    eventStart &&
    eventEnd &&
    new Date(eventStart).toDateString() !== new Date(eventEnd).toDateString();

  if (multi && eventStart && eventEnd) {
    /**
     * Canonical `wedding_date` must stay inside the resolved multi-day window unless we have strong evidence:
     * - explicit ceremony wording in the message that resolves to a day in range, or
     * - LLM `ceremony_date` that falls inside the range.
     * Otherwise always anchor to the first day — never keep an out-of-range model guess for `wedding_date`.
     */
    const explicitCeremonyIso = tryParseExplicitCeremonyDayIso(rawMessage, new Date(eventStart), new Date(eventEnd));
    if (explicitCeremonyIso) {
      weddingDate = explicitCeremonyIso;
    } else if (ceremonyDate && isIsoWithin(eventStart, eventEnd, ceremonyDate)) {
      weddingDate = ceremonyDate;
    } else {
      weddingDate = eventStart;
    }
  } else if (ceremonyDate) {
    weddingDate = ceremonyDate;
  }

  if (!multi && weddingDate && !eventStart && !eventEnd) {
    /** Single-day — leave event range columns empty for DB/UI. */
  }

  return {
    couple_names: parsed.couple_names ?? "Unknown",
    wedding_date: weddingDate,
    event_start_date: multi ? eventStart : null,
    event_end_date: multi ? eventEnd : null,
    location: normalizeNullableString(parsed.location),
    budget: normalizeNullableString(parsed.budget),
    story_notes: typeof parsed.story_notes === "string" ? parsed.story_notes : "",
    raw_facts: typeof parsed.raw_facts === "string" ? parsed.raw_facts : "",
  };
}

function isIsoWithin(startIso: string, endIso: string, candidateIso: string): boolean {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  const c = new Date(candidateIso).getTime();
  return c >= a && c <= b;
}
