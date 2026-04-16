/**
 * Verifies the **deployed** Supabase `inngest` Edge handler matches the expected bundle size.
 *
 * The Inngest **Cloud dashboard** can show stale function names (including removed crons) if:
 * - You are viewing a different **environment** (Branch vs Production) or **Inngest account**
 * - The app's **Sync URL** in Inngest does not match this project's `https://<ref>.supabase.co/functions/v1/inngest`
 * - Cloud has not completed a sync after deploy (run `npm run inngest:sync-supabase` and/or use Dashboard → Sync)
 *
 * App id in code: `atelier-os` (`supabase/functions/_shared/inngest.ts`).
 *
 * Run: `npx tsx scripts/inngest_verify_supabase_serve_alignment.ts`
 * npm: `npm run inngest:verify-serve`
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Must match `functions: [...]` length in `supabase/functions/inngest/index.ts`. Update when adding/removing workers. */
const EXPECTED_FUNCTION_COUNT = 31;

/** Unregistered from `serve()` for Gmail validation — if these still **run** in Cloud, the Cloud app is stale or wrong env. */
const GMAIL_MAINTENANCE_SLUGS_REMOVED_FROM_BUNDLE = [
  "prepare-gmail-import-candidate-materialization",
  "backfill-gmail-import-candidate-materialization",
  "repair-gmail-messages-inline-html-artifacts",
  "repair-gmail-import-candidate-artifact-inline-html",
] as const;

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
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_URL.");
  process.exit(1);
}

const url = `${base}/functions/v1/inngest`;

const res = await fetch(url, { method: "GET" });
const text = await res.text();
let body: Record<string, unknown>;
try {
  body = JSON.parse(text) as Record<string, unknown>;
} catch {
  console.error("Non-JSON GET response:", text.slice(0, 500));
  process.exit(1);
}

const count = typeof body.function_count === "number" ? body.function_count : null;
const aligned = count === EXPECTED_FUNCTION_COUNT;

console.log(
  JSON.stringify(
    {
      serve_url: url,
      http_status: res.status,
      function_count: count,
      expected_function_count: EXPECTED_FUNCTION_COUNT,
      aligned,
      mode: body.mode,
      has_signing_key: body.has_signing_key,
      has_event_key: body.has_event_key,
    },
    null,
    2,
  ),
);

if (!aligned) {
  console.error(
    "\nMismatch: deploy `inngest` Edge function or update EXPECTED_FUNCTION_COUNT in this script after changing serve() list.",
  );
  process.exit(1);
}

console.log(
  "\n--- Inngest Cloud alignment (manual) ---\n" +
    `1. Open Inngest Cloud → app **atelier-os** → **Production** (not a preview branch unless you use Branch Environments).\n` +
    `2. Settings / Sync: **Sync URL** must be exactly:\n   ${url}\n` +
    `3. Run **Sync** from the dashboard (or \`npm run inngest:sync-supabase\`) after each \`deploy:inngest\`.\n` +
    `4. Confirm project secret **INNGEST_ALLOW_IN_BAND_SYNC=1** (Supabase Edge) so Cloud registers the full list.\n` +
    `5. These function IDs must **not** appear as active workers if the bundle is current (removed from repo serve()):\n` +
    GMAIL_MAINTENANCE_SLUGS_REMOVED_FROM_BUNDLE.map((s) => `   - ${s}`).join("\n") +
    `\n6. If Cloud still lists them as **running** crons, cancel old runs; if they still **appear** in the function list, Cloud registry is stale — repeat step 3 or contact Inngest support / check Branch env.\n`,
);
