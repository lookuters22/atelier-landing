#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/** Print draft rows (body + instruction_history) for the fixture thread. */
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
const fixtures = JSON.parse(await Deno.readTextFile(fixturesPath)) as { threadId: string };

const supabase = createClient(url.trim(), sr);
const { data, error } = await supabase
  .from("drafts")
  .select("id, status, body, instruction_history")
  .eq("thread_id", fixtures.threadId)
  .order("id", { ascending: true });

if (error) throw new Error(error.message);
console.log(JSON.stringify({ threadId: fixtures.threadId, count: data?.length ?? 0, drafts: data }, null, 2));
