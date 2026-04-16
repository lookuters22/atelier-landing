/**
 * Triggers Inngest Cloud to re-register functions from the deployed `inngest` Edge bundle.
 *
 * Without this handshake, new triggers (e.g. `import/gmail.watch_renew.v1`) may never run:
 * the Event API can return 200 while no function is subscribed until sync completes.
 *
 * Loads `.env` / `supabase/.env` like other rollout scripts. Uses `VITE_SUPABASE_URL` or `SUPABASE_URL`.
 *
 * Run: npx tsx scripts/inngest_supabase_sync_put.ts
 * npm: npm run inngest:sync-supabase
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

const base = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim().replace(/\/+$/, "");
if (!base) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_URL (set in .env or environment).");
  process.exit(1);
}

const url = `${base}/functions/v1/inngest`;

const getRes = await fetch(url, { method: "GET" });
const getText = await getRes.text();
let getParsed: unknown;
try {
  getParsed = JSON.parse(getText) as unknown;
} catch {
  getParsed = getText;
}

const res = await fetch(url, { method: "PUT" });
const text = await res.text();
let parsed: unknown;
try {
  parsed = JSON.parse(text) as unknown;
} catch {
  parsed = text;
}
console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      ok: res.ok,
      url,
      get_before_put: { httpStatus: getRes.status, body: getParsed },
      put_body: parsed,
    },
    null,
    2,
  ),
);
if (!res.ok) process.exit(1);
