/**
 * Operator-assistant only: deterministic weather “tool” (Open-Meteo). No webs search; one external family of endpoints.
 */
import type { AssistantContext } from "../../../../../src/types/assistantContext.types.ts";
import {
  describeWmoWeatherCode,
  openMeteoDailyForDate,
  openMeteoGeocode,
} from "./openMeteoClient.ts";
import { allowOperatorAssistantWeather } from "./operatorAssistantWeatherRateLimit.ts";

const SOURCE = "Open-Meteo (https://open-meteo.com/)";
/** Free forecast API: daily data typically available for today through ~16 days ahead. */
const MAX_DAYS_AHEAD = 16;

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar day offset from "today" (UTC) to `target` YYYY-MM-DD; can be negative (past). */
export function calendarDaysFromTodayToTargetDate(targetDateIso: string, now: Date = new Date()): number {
  const [y, m, d] = targetDateIso.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  const t = Date.UTC(y, m - 1, d);
  const n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((t - n) / 86400000);
}

export function isOperatorWeatherIntent(queryText: string): boolean {
  const t = queryText.trim().toLowerCase();
  if (t.length < 4) return false;
  return /\b(weather|forecast|rain|snow|sunn(y|y days)|cloud|temperature|wind|storm|will it rain|chance of rain|humid|humidity|precipitation|how cold|how hot|how warm|umbrella)\b/.test(
    t,
  );
}

function parseIsoFromQuery(text: string): string | null {
  const m = text.match(/\b(20[2-3]\d-\d{2}-\d{2})\b/);
  return m ? m[1]! : null;
}

/** Pull a likely place name the operator named explicitly (e.g. "Budapest", "in Paris"). */
function parseExplicitLocationFromQuery(text: string): string | null {
  const t = text.trim();
  // "forecast for Budapest on 2026-05-01" / "weather in Capri on Sep 26"
  const a = t.match(
    /\b(?:forecast|weather)\s+(?:for|in|at)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s,'.\-–]+?)(?:\s+on|\s+for|\s*[\?\n!]|$)/i,
  );
  if (a?.[1]) return a[1]!.replace(/\s+/g, " ").trim();
  // trailing "in Cityname"
  const b = t.match(
    /\bin\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s,'.\-–]+?)(?:\s+on\s+\d|\s*[\?\n!]|\s+for\s+20\d\d|$)/i,
  );
  if (b?.[1]) return b[1]!.replace(/\s+/g, " ").trim();
  // " for Budapest" without weather prefix
  const c = t.match(/\bfor\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ\s,'.\-–]{2,40})(?:\s+on|\s*[\?\n!]|\s+20\d\d|$)/i);
  if (c?.[1] && c[1]!.length < 50) return c[1]!.replace(/\s+/g, " ").trim();
  return null;
}

function referencesFocusedProjectWording(text: string): boolean {
  return /\b(this|our|the)\s+(project|wedding|shoot(ing)?|event|day|date|venue)\b|shoot\s+date|that\s+day|for\s+this\s+shoot|the\s+focused|venue\b/i.test(
    text,
  );
}

type Resolve = { locationQuery: string; dateIso: string; source: "explicit" | "focused_project" | "mixed" } | null;

function resolveLocationAndDate(ctx: AssistantContext, query: string): Resolve | null {
  const explicitDate = parseIsoFromQuery(query);
  const explicitPlace = parseExplicitLocationFromQuery(query);
  const f = ctx.focusedProjectRowHints;
  const hasFocus = f != null && f.location.trim().length > 0;
  const refP = referencesFocusedProjectWording(query);

  const focusDate = f?.wedding_date?.trim() || f?.event_start_date?.trim() || f?.event_end_date?.trim() || null;

  /** Location: explicit place in text wins; else project venue when the question ties to the focus or only a date was given. */
  let locationQuery: string | null = explicitPlace ?? null;
  if (!locationQuery && hasFocus) {
    if (refP) {
      locationQuery = f!.location.trim();
    } else if (explicitDate && !explicitPlace) {
      locationQuery = f!.location.trim();
    }
  }

  /** Date: ISO in text wins; else project event/wedding date when the question references the project. */
  let dateIso: string | null = explicitDate ?? null;
  if (!dateIso && hasFocus && refP && focusDate) {
    dateIso = focusDate;
  }

  if (!locationQuery || !dateIso) return null;

  let source: Resolve["source"] = "mixed";
  if (explicitPlace && explicitDate) source = "explicit";
  else if (!explicitPlace && !explicitDate && hasFocus && refP) source = "focused_project";
  else source = "mixed";

  return { locationQuery, dateIso, source };
}

/**
 * If the query is not about weather, returns `null` (no prompt section).
 * If weather but resolution/rate limit/API fails, returns markdown explaining limits (model must not invent data).
 */
export async function buildOperatorAssistantWeatherMarkdown(
  ctx: AssistantContext,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!isOperatorWeatherIntent(ctx.queryText)) {
    return null;
  }

  const r = resolveLocationAndDate(ctx, ctx.queryText);
  if (!r) {
    return [
      `**Weather lookup (not run):** ${SOURCE}`,
      "",
      "Not enough information to call the weather service. Name a **place** and a **calendar date (YYYY-MM-DD)**, *or* ask with a **focused project** that has **venue/location** and a **wedding or event date** in context, and use phrasing like “this project” or “the shoot day.”",
    ].join("\n");
  }

  const offset = calendarDaysFromTodayToTargetDate(r.dateIso);
  if (Number.isNaN(offset)) {
    return [`**Error:** ${SOURCE}`, "", "Could not read the target date. Use a valid YYYY-MM-DD date."].join("\n");
  }
  if (offset > MAX_DAYS_AHEAD) {
    return [
      `**Forecast unavailable (window):** ${SOURCE}`,
      `**Requested date:** \`${r.dateIso}\` (${offset} day(s) from today)`,
      "",
      `Open-Meteo’s free daily **forecast** is typically only available for about the next **${MAX_DAYS_AHEAD} days** from today. Do **not** invent temperatures or conditions — tell the operator the forecast is not available for that far-out date with this tool.`,
    ].join("\n");
  }
  if (offset < 0) {
    return [
      `**Note:** ${SOURCE}`,
      `**Requested date:** \`${r.dateIso}\` (in the **past** relative to today)`,
      "",
      "The studio assistant uses a **short-range forecast** feed. For historical or past dates, do **not** present data as a verified past observation unless you have a different source — say a historical lookup is not available in this tool.",
    ].join("\n");
  }

  if (!allowOperatorAssistantWeather(ctx.photographerId)) {
    return [
      `**Rate limit:** ${SOURCE}`,
      `**As of (UTC):** \`${new Date().toISOString()}\``,
      "",
      "Weather lookup is temporarily limited for this studio assistant (per-hour cap). Please try again in a few minutes.",
    ].join("\n");
  }

  try {
    const geo = await openMeteoGeocode(r.locationQuery, fetchImpl);
    if (!geo) {
      return [
        `**Geocoding failed:** ${SOURCE}`,
        `**Tried place:** \`${r.locationQuery}\``,
        "",
        "No coordinates were returned. Ask the operator to name a more standard city or region, or add location on the project.",
      ].join("\n");
    }

    const day = await openMeteoDailyForDate(geo.latitude, geo.longitude, r.dateIso, fetchImpl);
    if (!day) {
      return [
        `**Forecast row missing:** ${SOURCE}`,
        `**Place:** ${geo.name}${geo.country ? `, ${geo.country}` : ""} (\`${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)}\`)`,
        `**Date:** \`${r.dateIso}\``,
        "",
        "The API did not return a data row for that day (outside the available window or an API error). **Do not invent** numbers; say the lookup did not return data.",
      ].join("\n");
    }

    const label = describeWmoWeatherCode(day.weathercode);
    const tmin = day.tempMinC != null ? `${day.tempMinC.toFixed(1)}°C` : "n/a";
    const tmax = day.tempMaxC != null ? `${day.tempMaxC.toFixed(1)}°C` : "n/a";
    const pmax = day.precipProbMax != null ? `${day.precipProbMax}` : "n/a";

    return [
      `**Source:** ${SOURCE}`,
      `**As of (tool run, UTC):** \`${new Date().toISOString()}\``,
      `**Resolution:** \`${r.source}\` (explicit vs focused project mix)`,
      `**Place (geocoded):** ${geo.name}${geo.country ? `, ${geo.country}` : ""} — lat \`${geo.latitude.toFixed(4)}\`, lon \`${geo.longitude.toFixed(4)}\``,
      `**Date (UTC day):** \`${day.date}\``,
      `**WMO weather code:** \`${day.weathercode}\` — *${label}*`,
      `**Daily min / max (°C, model height):** ${tmin} / ${tmax}`,
      `**Max precipitation probability (%):** ${pmax}`,
      "",
      "Summarize for the operator in natural language. **Do not** add any numbers that are not above. Cite the source name when you mention the forecast.",
    ].join("\n");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [`**Fetch error:** ${SOURCE}`, `**Message:** \`${msg}\``, "", "Tell the operator the weather service failed and to try again; do not invent values."].join(
      "\n",
    );
  }
}
