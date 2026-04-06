#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * 10-turn conversational simulator (same mechanics as qa_sim_conversation.ts).
 * Sends `qa_sim_turn` on `ai/intent.persona` so Edge logs `persona_metrics` can be correlated per turn.
 *
 * Token usage: each Anthropic `/v1/messages` response logs
 * `{"type":"persona_metrics","usage":{...},"qa_sim_turn":N}` in Supabase → Edge Functions → inngest → Logs.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildPersonaRawFactsFromThread } from "../_shared/memory/buildPersonaRawFacts.ts";
import {
  loadQaEnvFromRepo,
  resolveInngestEventKey,
  resolveServiceRoleKey,
} from "./_qa_env.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

await loadQaEnvFromRepo();

type Fixtures = {
  photographerId: string;
  weddingId: string;
  threadId: string;
  email: string;
};

/** Ten-turn inquiry → booking arc (simulated client). */
const SCENARIO_MESSAGES = [
  "Hi! We're getting married in Lake Como next September and love your editorial style. Are you available that month?",
  "Our budget is around $15,000. Do you offer video, or photography only?",
  "That helps. How many hours of coverage do your packages typically include?",
  "We expect about 120 guests. Do you bring a second shooter?",
  "What does travel from your home base look like for a Lake Como wedding?",
  "Can we schedule a video call to review the brochure before we commit?",
  "If we move forward, what's the booking process and payment schedule?",
  "We're comparing two dates in September — can you hold both briefly while we decide?",
  "We've picked September 12. What are the exact next steps to sign?",
  "Thank you — we're excited. Please send the contract when ready.",
];

function env(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

async function loadFixtures(): Promise<Fixtures> {
  const abs = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    ".qa_fixtures.json",
  );
  const raw = await Deno.readTextFile(abs);
  const j = JSON.parse(raw) as Fixtures & Record<string, unknown>;
  return {
    photographerId: j.photographerId,
    weddingId: j.weddingId,
    threadId: j.threadId,
    email: j.email ?? "client@qa.sim",
  };
}

function supabaseUrl(): string {
  const u = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL or VITE_SUPABASE_URL required");
  return u;
}

async function sendInngest(
  events: Array<{ name: string; data: Record<string, unknown> }>,
): Promise<void> {
  const key = resolveInngestEventKey();
  if (!key) {
    throw new Error(
      "INNGEST_EVENT_KEY required in .env (Inngest Cloud → environment → Event key for sending events)",
    );
  }
  const url = "https://inn.gs/e/" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("Inngest send failed " + String(res.status) + ": " + text);
  }
  console.log("[inngest]", res.status, text.slice(0, 200));
}

async function fetchDraftIds(
  supabase: SupabaseClient,
  threadId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("drafts")
    .select("id")
    .eq("thread_id", threadId);
  if (error) throw new Error("drafts ids: " + error.message);
  return new Set((data ?? []).map((r) => r.id as string));
}

async function pollNewPendingDraft(
  supabase: SupabaseClient,
  threadId: string,
  beforeIds: Set<string>,
  deadlineMs: number,
): Promise<{ id: string; body: string }> {
  const start = Date.now();
  const intervalMs = 2000;
  while (Date.now() - start < deadlineMs) {
    const { data, error } = await supabase
      .from("drafts")
      .select("id, body, status")
      .eq("thread_id", threadId)
      .eq("status", "pending_approval");
    if (error) throw new Error("drafts poll: " + error.message);
    for (const row of data ?? []) {
      const id = row.id as string;
      if (!beforeIds.has(id)) {
        return { id, body: row.body as string };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Timed out waiting for a new pending_approval draft (Persona run may have failed or is very slow).",
  );
}

const turnGapMs = Number(env("QA_TURN_GAP_MS") ?? "4000");
const draftPollMs = Number(env("QA_DRAFT_POLL_MS") ?? "360000");

const fixtures = await loadFixtures();
const sr = resolveServiceRoleKey();
if (!sr) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required in .env");
}

const supabase = createClient(supabaseUrl(), sr);

console.log("=== QA 10-turn simulator (Persona via ai/intent.persona) ===");
console.log("threadId:", fixtures.threadId);
console.log("weddingId:", fixtures.weddingId);
console.log("turns:", SCENARIO_MESSAGES.length);
console.log("");
console.log(
  "NOTE: input_tokens / output_tokens are logged on the Edge function as persona_metrics (see Supabase Dashboard → Edge Functions → inngest → Logs).",
);
console.log("");

let turn = 0;
for (const clientText of SCENARIO_MESSAGES) {
  turn += 1;
  console.log(`\n=== STARTING TURN [${turn}] ===\n`);
  console.log("Inbound:");
  console.log(clientText);
  console.log("");

  const { error: inErr } = await supabase.from("messages").insert({
    thread_id: fixtures.threadId,
    direction: "in",
    sender: fixtures.email,
    body: clientText,
  });
  if (inErr) throw new Error("insert inbound message: " + inErr.message);

  const raw_facts = await buildPersonaRawFactsFromThread(
    supabase,
    fixtures.photographerId,
    fixtures.threadId,
  );

  const draftIdsBefore = await fetchDraftIds(supabase, fixtures.threadId);

  await sendInngest([
    {
      name: "ai/intent.persona",
      data: {
        wedding_id: fixtures.weddingId,
        thread_id: fixtures.threadId,
        photographer_id: fixtures.photographerId,
        raw_facts,
        reply_channel: "web",
        qa_sim_turn: turn,
      },
    },
  ]);

  console.log("[poll] waiting for new draft (pending_approval)…");
  const draft = await pollNewPendingDraft(
    supabase,
    fixtures.threadId,
    draftIdsBefore,
    draftPollMs,
  );

  console.log("\n--- AI draft (pending_approval) ---");
  console.log(draft.body);
  console.log("");

  const { error: upErr } = await supabase
    .from("drafts")
    .update({ status: "approved" })
    .eq("id", draft.id);
  if (upErr) throw new Error("draft approve: " + upErr.message);

  const { error: outErr } = await supabase.from("messages").insert({
    thread_id: fixtures.threadId,
    direction: "out",
    sender: "photographer",
    body: draft.body,
  });
  if (outErr) throw new Error("insert outbound message: " + outErr.message);

  console.log("[ok] draft approved + outbound recorded.");

  if (turn < SCENARIO_MESSAGES.length) {
    console.log(`[wait] ${turnGapMs}ms before next turn…`);
    await new Promise((r) => setTimeout(r, turnGapMs));
  }
}

console.log("\n=== 10-turn simulator complete ===");
console.log(
  "Correlate turns to token logs: search logs for persona_metrics and qa_sim_turn 1…10 (multiple persona_metrics lines per turn if tool rounds > 1).",
);
