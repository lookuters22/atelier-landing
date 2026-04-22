/**
 * UTC calendar windows for operator inquiry count questions (no tenant timezone; stated in the prompt).
 * ISO 8601 week: Monday 00:00 UTC through Sunday; “this week” is Monday start → `now` (inclusive of elapsed time, exclusive of the future).
 */

export type UtcInquiryCountWindows = {
  now: string;
  today: { start: string; end: string };
  yesterday: { start: string; end: string };
  thisWeek: { start: string; end: string };
  lastWeek: { start: string; end: string };
  /** Earliest `first_inbound_at` a row must have to appear in any of the four count windows. */
  dbLookbackStart: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toUtcIsoString(d: Date): string {
  return d.toISOString();
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Monday = 0 … Sunday = 6 (UTC) */
function mondayIndexUtc(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 6 : wd - 1;
}

export function startOfIsoWeekUtc(d: Date): Date {
  const sod = startOfUtcDay(d);
  return addUtcDays(sod, -mondayIndexUtc(sod));
}

/**
 * Produces the four window bounds for inquiry counts. `thisWeek.end` equals `now` (use `< now` in comparisons).
 * `lastWeek` is the full previous ISO week Mon 00:00 → Mon 00:00 (end exclusive in callers).
 */
export function computeUtcInquiryCountWindows(now: Date): UtcInquiryCountWindows {
  const todayStart = startOfUtcDay(now);
  const todayEnd = addUtcDays(todayStart, 1);
  const yesterdayStart = addUtcDays(todayStart, -1);
  const thisWeekStart = startOfIsoWeekUtc(now);
  const lastWeekStart = addUtcDays(thisWeekStart, -7);
  const lastWeekEnd = thisWeekStart;
  const dbLookback = lastWeekStart;
  return {
    now: toUtcIsoString(now),
    today: { start: toUtcIsoString(todayStart), end: toUtcIsoString(todayEnd) },
    yesterday: { start: toUtcIsoString(yesterdayStart), end: toUtcIsoString(todayStart) },
    thisWeek: { start: toUtcIsoString(thisWeekStart), end: toUtcIsoString(now) },
    lastWeek: { start: toUtcIsoString(lastWeekStart), end: toUtcIsoString(lastWeekEnd) },
    dbLookbackStart: toUtcIsoString(dbLookback),
  };
}

export function formatUtcWindowLabelForOperator(startIso: string, endIso: string, endIsNow: boolean): string {
  const s = startIso.slice(0, 10);
  const e = endIsNow ? "now" : endIso.slice(0, 10);
  return endIsNow ? `${s} → ${e} (UTC)` : `${s} → ${e} (UTC, end exclusive)`;
}
