#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * One-off QA fixture seed for remote Supabase (service role).
 * Writes .qa_fixtures.json alongside this script for qa_runner.ts
 *
 * Loads repo root `.env` and `supabase/.env` automatically (see `_qa_env.ts`).
 * Required in .env: `SUPABASE_SERVICE_ROLE_KEY` (or `SERVICE_ROLE_KEY`) — the **service_role**
 * JWT from Supabase Dashboard → Settings → API. The anon / `VITE_*_ANON_*` key cannot insert QA rows.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadQaEnvFromRepo, resolveServiceRoleKey } from "./_qa_env.ts";

await loadQaEnvFromRepo();

const url =
  Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("VITE_SUPABASE_URL") ??
  "";
const key = resolveServiceRoleKey() ?? "";

if (!url) {
  console.error("Missing SUPABASE_URL or VITE_SUPABASE_URL (add to repo .env or export).");
  Deno.exit(1);
}
if (!key) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env. Use the service_role JWT from Supabase Dashboard → Settings → API. " +
      "The VITE_SUPABASE_ANON_KEY / publishable key cannot run QA inserts.",
  );
  Deno.exit(1);
}

const supabase = createClient(url, key);

const email = `qa_automation_${crypto.randomUUID().slice(0, 8)}@qa.atelier.test`;

const { data: photographer, error: pErr } = await supabase
  .from("photographers")
  .insert({ email, settings: {} })
  .select("id")
  .single();

if (pErr || !photographer) {
  console.error("photographers insert:", pErr?.message);
  Deno.exit(1);
}

const photographerId = photographer.id as string;

const weddingDate = new Date();
weddingDate.setFullYear(weddingDate.getFullYear() + 1);

const { data: wedding, error: wErr } = await supabase
  .from("weddings")
  .insert({
    photographer_id: photographerId,
    couple_names: "QA Automation Couple",
    wedding_date: weddingDate.toISOString(),
    location: "QA City",
    stage: "inquiry",
  })
  .select("id")
  .single();

if (wErr || !wedding) {
  console.error("weddings insert:", wErr?.message);
  Deno.exit(1);
}

const weddingId = wedding.id as string;

const { data: thread, error: tErr } = await supabase
  .from("threads")
  .insert({
    wedding_id: weddingId,
    photographer_id: photographerId,
    title: "QA Automation Thread",
    kind: "group",
  })
  .select("id")
  .single();

if (tErr || !thread) {
  console.error("threads insert:", tErr?.message);
  Deno.exit(1);
}

const threadId = thread.id as string;

const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const end = new Date(start.getTime() + 60 * 60 * 1000);

const { data: calEvent, error: cErr } = await supabase
  .from("calendar_events")
  .insert({
    photographer_id: photographerId,
    wedding_id: weddingId,
    title: "QA Calendar Event",
    event_type: "about_call",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    meeting_link: "https://example.com/qa-meet",
  })
  .select("id")
  .single();

if (cErr || !calEvent) {
  console.error("calendar_events insert:", cErr?.message);
  Deno.exit(1);
}

const fixtures = {
  photographerId,
  weddingId,
  threadId,
  calendarEventId: calEvent.id as string,
  startTime: start.toISOString(),
  email,
};

const outFile = new URL(".qa_fixtures.json", import.meta.url);
await Deno.writeTextFile(outFile, JSON.stringify(fixtures, null, 2));

console.log(JSON.stringify({ ok: true, fixturesPath: outFile.href, ...fixtures }, null, 2));
