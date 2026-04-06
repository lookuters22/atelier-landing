#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
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
const f = JSON.parse(await Deno.readTextFile(fixturesPath)) as {
  weddingId: string;
  threadId: string;
  calendarEventId: string;
  startTime: string;
  photographerId: string;
};

const supabase = createClient(url.trim(), sr);

const { data: ev } = await supabase
  .from("calendar_events")
  .select("id, start_time")
  .eq("id", f.calendarEventId)
  .maybeSingle();

const { data: wedding } = await supabase
  .from("weddings")
  .select("id, stage")
  .eq("id", f.weddingId)
  .maybeSingle();

const { data: milestone } = await supabase
  .from("wedding_milestones")
  .select("retainer_paid, wedding_id")
  .eq("wedding_id", f.weddingId)
  .eq("photographer_id", f.photographerId)
  .maybeSingle();

const { data: threads } = await supabase
  .from("threads")
  .select("id, last_activity_at")
  .eq("wedding_id", f.weddingId)
  .order("last_activity_at", { ascending: false });

const { data: draftsByWedding } = await supabase
  .from("drafts")
  .select("id, thread_id, status, body, instruction_history")
  .in(
    "thread_id",
    (threads ?? []).map((t) => t.id),
  );

const fixtureMs = new Date(f.startTime).getTime();
const dbMs = ev?.start_time ? new Date(ev.start_time as string).getTime() : null;

console.log(
  JSON.stringify(
    {
      eventStartFromFixture: f.startTime,
      eventStartFromDb: ev?.start_time,
      msEqual: dbMs !== null && dbMs === fixtureMs,
      wedding,
      milestone,
      threadsOrdered: threads,
      draftsForAnyThreadOnWedding: draftsByWedding,
    },
    null,
    2,
  ),
);
