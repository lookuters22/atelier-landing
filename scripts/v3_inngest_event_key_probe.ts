/**
 * Validates `INNGEST_EVENT_KEY` against Inngest Cloud Event API (hosted acceptance).
 *
 * App id in code: `atelier-os` — see `supabase/functions/_shared/inngest.ts` (`new Inngest({ id: "atelier-os", ... })`).
 * In Inngest Cloud: use the **Event key** for the same account/environment where that app is registered
 * (Dashboard → Manage → Apps → Event key, or per-environment keys / branch envs per Inngest docs).
 *
 * Run: `npx tsx scripts/v3_inngest_event_key_probe.ts`
 * npm: `npm run v3:probe-inngest-key`
 *
 * Exit 0 only when POST returns success (typically HTTP 200 with `{ "ids": [...] }`).
 * 401 "Event key not found" → key revoked, wrong account, or wrong environment key.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseEnvLines(content: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.push({ key: k, value: v });
  }
  return out;
}

function loadEnv(): void {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

const key = process.env.INNGEST_EVENT_KEY?.trim();
if (!key) {
  console.error("Missing INNGEST_EVENT_KEY (set in .env or environment).");
  process.exit(1);
}

const url = `https://inn.gs/e/${encodeURIComponent(key)}`;
const body = JSON.stringify({
  name: "internal/v3.event_key_probe.v1",
  data: {
    schemaVersion: 1,
    source: "scripts/v3_inngest_event_key_probe.ts",
    at: new Date().toISOString(),
  },
});

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});

const text = await res.text();
let parsed: unknown;
try {
  parsed = JSON.parse(text) as unknown;
} catch {
  parsed = text;
}

const suffix = key.length > 6 ? `…${key.slice(-4)}` : "(short)";
console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      ok: res.ok,
      keySuffix: suffix,
      response: parsed,
    },
    null,
    2,
  ),
);

process.exit(res.ok ? 0 : 1);
