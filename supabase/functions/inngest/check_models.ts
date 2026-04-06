#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Temporary diagnostic: list model ids visible to ANTHROPIC_API_KEY (billing / tier).
 * Remove after picking a working model for personaAgent.ts.
 */
import { loadQaEnvFromRepo } from "./_qa_env.ts";

await loadQaEnvFromRepo();

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey?.trim()) {
  throw new Error("ANTHROPIC_API_KEY missing — set in repo .env or supabase/.env");
}

const url = "https://api.anthropic.com/v1/models";
const res = await fetch(url, {
  method: "GET",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
});

const text = await res.text();
if (!res.ok) {
  console.error("Request failed:", res.status, text);
  Deno.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(text);
} catch {
  console.error("Non-JSON response:", text.slice(0, 500));
  Deno.exit(1);
}

const data = parsed as { data?: Array<{ id: string }> };
const ids = (data.data ?? []).map((m) => m.id).filter(Boolean);
console.log("Anthropic /v1/models — model ids (", ids.length, "):");
console.log(JSON.stringify(ids, null, 2));
