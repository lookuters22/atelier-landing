#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Print every draft row for the QA fixture thread (chronological).
 * Uses `created_at` when present (see migration 20260404210000_drafts_created_at.sql); else falls back to `id`.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadQaEnvFromRepo, resolveServiceRoleKey } from "./_qa_env.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

await loadQaEnvFromRepo();

const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const sr = resolveServiceRoleKey();
if (!url?.trim() || !sr) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");

const fixturesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".qa_fixtures.json",
);
const { threadId } = JSON.parse(await Deno.readTextFile(fixturesPath)) as { threadId: string };

function extractModel(instructionHistory: unknown): string {
  if (!Array.isArray(instructionHistory)) return "(unknown)";
  for (const entry of instructionHistory) {
    if (entry && typeof entry === "object" && "model" in entry) {
      const m = (entry as { model?: unknown }).model;
      if (typeof m === "string" && m.length > 0) return m;
    }
  }
  return "(not in instruction_history)";
}

type DraftRow = {
  id: string;
  status: string;
  body: string;
  instruction_history: unknown;
  created_at?: string;
};

const supabase = createClient(url.trim(), sr);

let rows: DraftRow[] | null = null;
let orderNote = "created_at ASC";

let res = await supabase
  .from("drafts")
  .select("id, status, body, instruction_history, created_at")
  .eq("thread_id", threadId)
  .order("created_at", { ascending: true })
  .order("id", { ascending: true });

if (res.error) {
  const msg = res.error.message ?? "";
  if (msg.includes("created_at") || msg.includes("column")) {
    console.warn(
      "[qa_print_all_drafts] created_at missing — ordering by id. Apply migration 20260404210000_drafts_created_at.sql for true chronological order.\n",
    );
    orderNote = "id ASC (fallback)";
    res = await supabase
      .from("drafts")
      .select("id, status, body, instruction_history")
      .eq("thread_id", threadId)
      .order("id", { ascending: true });
  }
  if (res.error) throw new Error(res.error.message);
}

rows = res.data as DraftRow[] | null;
const list = rows ?? [];
const total = list.length;

console.log(`threadId: ${threadId}`);
console.log(`drafts: ${total} (order: ${orderNote})`);
console.log("");

for (let i = 0; i < total; i++) {
  const d = list[i];
  const model = extractModel(d.instruction_history);
  console.log(`\n=== DRAFT [${i + 1}/${total}] | Status: ${d.status} | Model: ${model} ===\n`);
  console.log(d.body.trim());
  console.log("\n------------------------------------------------");
}
