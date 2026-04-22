/**
 * In-process per-tenant rate cap for the weather tool (edge isolate). No DB.
 */
const HOUR_MS = 60 * 60 * 1000;

const bucket = new Map<string, { count: number; windowStart: number }>();

function envGet(k: string): string | undefined {
  if (typeof (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno?.env
    ?.get === "function") {
    return (globalThis as { Deno: { env: { get: (key: string) => string | undefined } } }).Deno.env.get(k);
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[k];
  }
  return undefined;
}

function maxPerHour(): number {
  const raw = envGet("OPERATOR_ASSISTANT_WEATHER_MAX_PER_HOUR");
  if (raw == null || raw === "") return 40;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** Returns false when the tenant is over the cap for the current hour window. */
export function allowOperatorAssistantWeather(photographerId: string, now = Date.now()): boolean {
  const max = maxPerHour();
  const w = HOUR_MS;
  let b = bucket.get(photographerId);
  if (!b || now - b.windowStart >= w) {
    b = { count: 1, windowStart: now };
    bucket.set(photographerId, b);
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** @internal tests */
export function __resetOperatorAssistantWeatherRateLimitForTests(): void {
  bucket.clear();
}
