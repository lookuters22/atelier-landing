/**
 * Load repo `.env` / `supabase/.env` into Deno.env (does not override existing vars).
 * Resolves from `supabase/functions/inngest/` → project root is three levels up.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..", "..");
function parseAndApplyEnvBlock(text: string): void {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!Deno.env.get(key)) {
      Deno.env.set(key, val);
    }
  }
}

export async function loadQaEnvFromRepo(): Promise<void> {
  for (const rel of [".env", path.join("supabase", ".env")]) {
    const abs = path.join(repoRoot, rel);
    try {
      const text = await Deno.readTextFile(abs);
      parseAndApplyEnvBlock(text);
    } catch (e) {
      if (Deno.env.get("QA_DEBUG")) {
        console.warn("[qa_env] skip", abs, e instanceof Error ? e.message : e);
      }
    }
  }
  if (Deno.env.get("QA_DEBUG")) {
    console.log(
      "[qa_env] VITE url:",
      Boolean(Deno.env.get("VITE_SUPABASE_URL")),
      "service role:",
      Boolean(resolveServiceRoleKey()),
    );
  }
}

/** Service role JWT (not the anon / publishable key). */
export function resolveServiceRoleKey(): string | undefined {
  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY")
  );
}

export function resolveInngestEventKey(): string | undefined {
  return (
    Deno.env.get("INNGEST_EVENT_KEY") ??
    Deno.env.get("INNGEST_KEY") ??
    Deno.env.get("EVENT_KEY")
  );
}
