#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * 15-turn stress simulator: full client lifecycle, drains ALL pending drafts per turn,
 * logs token usage from drafts.instruction_history (when present), running totals + final summary.
 * raw_facts uses thread_summaries + last N messages only (see buildPersonaRawFacts.ts) — no full transcript.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY, `.qa_fixtures.json`
 * Optional: QA_SIM_POST_WAIT_MS (default 30000) — fixed pause after each Inngest send to stay under Anthropic TPM (~30k input/min).
 *   QA_SIM_DRAIN_POLL_MS — if no pending drafts after the wait, poll every 3s up to this many ms (default 120000, 0 = off).
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

/** Full client lifecycle — exact scenario strings for QA. */
const SCENARIO_MESSAGES = [
  "Hi! We are getting married in Lake Como next September and love your editorial style. Are you available?",
  "Our budget is around $15,000. Do you guys also do video, or just photography?",
  "Okay, no video is fine. Do you charge extra travel fees for Lake Como?",
  "Great. My parents are divorced and don't get along. Can you handle sensitive family dynamics during formal portraits?",
  "That makes me feel a lot better. What is your typical turnaround time to get the final gallery back?",
  "Do you provide the RAW unedited files as well?",
  "Understood. We're actually going to be in Paris this December. Do you ever do engagement shoots there?",
  "Let's do the Paris engagement shoot and the Lake Como wedding! How do we lock this all in?",
  "We just reviewed the contract and signed it.",
  "Payment has been sent! We are so excited to work with you.",
  "Hi Ana! We are 2 months out. We drafted a timeline for the day, can we send it over for review?",
  "We actually decided to hire a local videographer, their name is Marco. Just wanted to put that on your radar.",
  "The wedding was amazing! Thank you so much. When can we expect the sneak peeks?",
  "We are crying, the sneak peeks are gorgeous. Can we add a physical printed album to our package?",
  "Final payment for the album has been sent. Thank you for everything!",
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

/** Sum token usage from persona_agent (or any) `usage` objects on instruction_history entries. */
function extractTokenUsageFromInstructionHistory(
  instructionHistory: unknown,
): { input_tokens: number; output_tokens: number } | null {
  if (!Array.isArray(instructionHistory)) return null;
  let inSum = 0;
  let outSum = 0;
  let any = false;
  for (const entry of instructionHistory) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const u = o.usage;
    if (u && typeof u === "object") {
      const uo = u as Record<string, unknown>;
      const inp = uo.input_tokens;
      const outp = uo.output_tokens;
      if (typeof inp === "number") {
        inSum += inp;
        any = true;
      }
      if (typeof outp === "number") {
        outSum += outp;
        any = true;
      }
    }
  }
  return any ? { input_tokens: inSum, output_tokens: outSum } : null;
}

type PendingDraftRow = {
  id: string;
  body: string;
  instruction_history: unknown;
};

async function fetchPendingDrafts(
  supabase: SupabaseClient,
  threadId: string,
): Promise<PendingDraftRow[]> {
  const { data, error } = await supabase
    .from("drafts")
    .select("id, body, instruction_history")
    .eq("thread_id", threadId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });
  if (error) throw new Error("drafts pending: " + error.message);
  return (data ?? []) as PendingDraftRow[];
}

const fixtures = await loadFixtures();
const sr = resolveServiceRoleKey();
if (!sr) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY required in .env");
}

/** Fixed delay after firing `ai/intent.persona` before draining drafts — keeps concurrent Persona runs from stacking and avoids Anthropic 429 TPM. */
const postTurnWaitMs = Number(env("QA_SIM_POST_WAIT_MS") ?? "30000");
const drainPollMs = Number(env("QA_SIM_DRAIN_POLL_MS") ?? "120000");

const supabase = createClient(supabaseUrl(), sr);

let totalInputTokens = 0;
let totalOutputTokens = 0;
let draftsProcessed = 0;

console.log("=== QA 15-turn comprehensive simulator ===");
console.log("threadId:", fixtures.threadId);
console.log("weddingId:", fixtures.weddingId);
console.log("turns:", SCENARIO_MESSAGES.length);
console.log(
  "post-send wait (ms):",
  postTurnWaitMs,
  "(default 30s — Anthropic TPM / fewer concurrent Inngest Persona runs)",
);
console.log(
  "extra drain poll if empty (ms, 0=off):",
  drainPollMs,
);
console.log("");

let turn = 0;
for (const clientText of SCENARIO_MESSAGES) {
  turn += 1;
  console.log(`\n=== TURN [${turn}/${SCENARIO_MESSAGES.length}] — inbound ===\n`);
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

  console.log(
    `[wait] ${postTurnWaitMs / 1000}s to respect Anthropic TPM rate limits and allow Inngest to process (Persona + background flows)…`,
  );
  await new Promise((r) => setTimeout(r, postTurnWaitMs));

  let pending = await fetchPendingDrafts(supabase, fixtures.threadId);
  let polled = 0;
  const pollStep = 3000;
  while (
    pending.length === 0 &&
    drainPollMs > 0 &&
    polled < drainPollMs
  ) {
    console.log(
      `[poll] no drafts yet — waiting ${pollStep}ms (${polled}/${drainPollMs}ms extra)…`,
    );
    await new Promise((r) => setTimeout(r, pollStep));
    polled += pollStep;
    pending = await fetchPendingDrafts(supabase, fixtures.threadId);
  }

  console.log(`[drafts] pending_approval count: ${pending.length}`);

  if (pending.length === 0) {
    console.log(
      "[warn] No pending drafts after wait/poll — Persona may have failed or needs longer; continuing to next turn.",
    );
    continue;
  }

  for (const d of pending) {
    const usage = extractTokenUsageFromInstructionHistory(d.instruction_history);
    const inTok = usage?.input_tokens ?? null;
    const outTok = usage?.output_tokens ?? null;
    if (usage) {
      totalInputTokens += usage.input_tokens;
      totalOutputTokens += usage.output_tokens;
    }
    draftsProcessed += 1;

    const inStr = inTok != null ? String(inTok) : "(not in instruction_history)";
    const outStr = outTok != null ? String(outTok) : "(not in instruction_history)";

    console.log("\n=== NEW DRAFT DETECTED ===");
    console.log(`Tokens Used: ${inStr} In / ${outStr} Out`);
    console.log("Body:\n" + (d.body as string) + "\n");

    const { error: upErr } = await supabase
      .from("drafts")
      .update({ status: "approved" })
      .eq("id", d.id);
    if (upErr) throw new Error("draft approve: " + upErr.message);

    const { error: outErr } = await supabase.from("messages").insert({
      thread_id: fixtures.threadId,
      direction: "out",
      sender: "photographer",
      body: d.body,
    });
    if (outErr) throw new Error("insert outbound message: " + outErr.message);

    console.log(`[ok] draft ${d.id} approved + outbound recorded.`);
  }
}

console.log("\n");
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║              FINAL TOKEN USAGE SUMMARY (SIMULATOR)            ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log(`║ Total input tokens:  ${String(totalInputTokens).padEnd(38)}║`);
console.log(`║ Total output tokens: ${String(totalOutputTokens).padEnd(37)}║`);
console.log(`║ Turns completed:     ${String(SCENARIO_MESSAGES.length).padEnd(38)}║`);
console.log(`║ Drafts processed:    ${String(draftsProcessed).padEnd(38)}║`);
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log("\n=== 15-turn simulator complete ===");
