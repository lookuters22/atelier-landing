/**
 * Sends Inngest events to register Gmail watch and run one delta bootstrap (hosted).
 *
 * Prerequisites:
 * - `GMAIL_PUBSUB_TOPIC_NAME` is set in Supabase Edge secrets (same value as GCP topic full resource name).
 * - Local `INNGEST_EVENT_KEY` matches the Inngest Cloud Event key for app `atelier-os` (see Inngest Dashboard).
 *
 * Env:
 * - `INNGEST_EVENT_KEY` (required)
 * - `GMAIL_ROLLOUT_PHOTOGRAPHER_ID` (required)
 * - `GMAIL_ROLLOUT_CONNECTED_ACCOUNT_ID` (required)
 *
 * Loads optional `.env` / `supabase/.env` from repo root like `v3_inngest_event_key_probe.ts`.
 *
 * Usage:
 *   npx tsx scripts/gmail_rollout_send_activation_events.ts
 *
 * Or: npm run gmail:rollout:activation-events
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
const photographerId = process.env.GMAIL_ROLLOUT_PHOTOGRAPHER_ID?.trim();
const connectedAccountId = process.env.GMAIL_ROLLOUT_CONNECTED_ACCOUNT_ID?.trim();

if (!key) {
  console.error("Missing INNGEST_EVENT_KEY (set in .env or environment).");
  process.exit(1);
}
if (!photographerId || !connectedAccountId) {
  console.error(
    "Missing GMAIL_ROLLOUT_PHOTOGRAPHER_ID or GMAIL_ROLLOUT_CONNECTED_ACCOUNT_ID (set in .env or environment).",
  );
  process.exit(1);
}

const url = `https://inn.gs/e/${encodeURIComponent(key)}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function send(name: string, data: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ name, data });
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
  console.log(JSON.stringify({ event: name, httpStatus: res.status, ok: res.ok, response: parsed }, null, 2));
  if (!res.ok) process.exit(1);
}

await send("import/gmail.watch_renew.v1", {
  schemaVersion: 1,
  photographerId,
  connectedAccountId,
});

await sleep(1500);

await send("import/gmail.delta_sync.v1", {
  schemaVersion: 2,
  photographerId,
  connectedAccountId,
});
