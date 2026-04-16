/**
 * Push `ANTHROPIC_API_KEY` from local env into **Supabase project secrets** so deployed Edge Functions
 * (including `inngest` → `clientOrchestratorV1` → `maybeRewriteOrchestratorDraftWithPersona`) see it.
 *
 * Local `.env` is not visible to hosted workers; without this, hosted RBAC matrix shows stub-only drafts.
 *
 * Prerequisites: Supabase CLI logged in (`npx supabase login`), link or `SUPABASE_ACCESS_TOKEN`.
 *
 * Usage:
 *   npx tsx scripts/v3_sync_anthropic_secret_for_supabase.ts
 *
 * Does not print the key.
 */
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseEnvLines(content: string): void {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const rel of [".env", join("supabase", ".env")]) {
  const p = join(root, rel);
  if (existsSync(p)) parseEnvLines(readFileSync(p, "utf8"));
}

function projectRefFromSupabaseUrl(urlStr: string): string | null {
  try {
    const host = new URL(urlStr).hostname;
    const sub = host.split(".")[0];
    return sub && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

function main(): void {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!url) {
    console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL)");
    process.exit(1);
  }
  if (!key) {
    console.error("Missing ANTHROPIC_API_KEY in environment or .env");
    process.exit(1);
  }
  const ref = projectRefFromSupabaseUrl(url);
  if (!ref) {
    console.error("Could not parse project ref from SUPABASE_URL");
    process.exit(1);
  }

  const envName = "ANTHROPIC_API_KEY";
  const dir = mkdtempSync(join(tmpdir(), "supabase-secret-"));
  const envFile = join(dir, ".env.secret");
  writeFileSync(envFile, `${envName}=${key}\n`, "utf8");
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["supabase", "secrets", "set", "--env-file", envFile, "--project-ref", ref], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
    shell: false,
  });
  try {
    unlinkSync(envFile);
  } catch {
    /* ignore */
  }
  const out = (result.stdout ?? "") + (result.stderr ?? "");
  if (out.trim()) console.log(out.trim());
  if (result.status !== 0) {
    console.error(
      "supabase secrets set failed. Ensure CLI is logged in and project ref is correct. Then redeploy: npm run deploy:inngest",
    );
    process.exit(result.status ?? 1);
  }
  console.log(`Set ${envName} for project ${ref} (value not shown). Redeploy inngest: npm run deploy:inngest`);
}

main();
