#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/** Print Client / Studio transcript for fixture thread (messages table, sent_at order). */
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

const supabase = createClient(url.trim(), sr);
const { data, error } = await supabase
  .from("messages")
  .select("direction, sender, body, sent_at")
  .eq("thread_id", threadId)
  .order("sent_at", { ascending: true });

if (error) throw new Error(error.message);

const lines: string[] = [];
for (const r of data ?? []) {
  const who = r.direction === "in" ? "Client" : "Studio";
  lines.push(`[${who}] ${String(r.body ?? "").trim()}`);
}
console.log(lines.join("\n\n"));
