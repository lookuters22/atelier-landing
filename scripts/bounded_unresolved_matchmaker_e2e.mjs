/**
 * E2E proof: bounded unresolved email matchmaker (TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1).
 * Ingress: `inbox/thread.requires_triage.v1` + `source: gmail_delta` (pre-ingress `comms/email.received` retired).
 *
 * Prereqs:
 * - Secret TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1=1 on the Supabase Edge project (deployed inngest bundle).
 * - .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
 *
 * Run: node scripts/bounded_unresolved_matchmaker_e2e.mjs
 *
 * Case A (activation path): unknown sender + non-intake-biased body → expect subset eligible; matchmaker may/may not resolve.
 * Case B (fallback): unknown sender + intake-biased body → expect intake-shaped dispatch; matchmaker skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { enqueueInboxThreadRequiresTriageV1 } from "./lib/enqueueInboxThreadRequiresTriageV1.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inngestKey = process.env.INNGEST_EVENT_KEY;
const signingKey =
  process.env.INNGEST_SIGNING_KEY || process.env.INGEST_SINGIN_KEY || process.env.INGEST_SIGNING_KEY;

if (!url || !sr || !inngestKey) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or INNGEST_EVENT_KEY");
  process.exit(1);
}

if (!signingKey) {
  console.error("Missing INNGEST_SIGNING_KEY — required to poll classifier output");
  process.exit(1);
}

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
const photographerId = fixtures.photographerId;
const fixtureWeddingId = fixtures.weddingId;

const supabase = createClient(url, sr);

/** Load one active wedding to craft a high-signal matchmaker message (names / date / place). */
const { data: rosterWedding, error: rosterErr } = await supabase
  .from("weddings")
  .select("id, couple_names, wedding_date, location, stage")
  .eq("photographer_id", photographerId)
  .neq("stage", "archived")
  .neq("stage", "delivered")
  .limit(5);

if (rosterErr) throw rosterErr;
const pick = rosterWedding?.find((w) => w.id === fixtureWeddingId) ?? rosterWedding?.[0];
if (!pick) {
  console.error("No active weddings for photographer — cannot build roster-hinted activation body");
  process.exit(1);
}

const ts = Date.now();
const unknownSenderA = `bounded_activate_${ts}@qa.atelier.test`;
const unknownSenderB = `bounded_fallback_${ts}@qa.atelier.test`;

/** Non-intake bias: logistics + explicit roster anchors (helps matchmaker ≥90 if conservative prompt aligns). */
const bodyActivation =
  `Logistics follow-up for ${pick.couple_names ?? "the couple"}'s wedding` +
  (pick.wedding_date ? ` on ${String(pick.wedding_date).slice(0, 10)}` : "") +
  (pick.location ? ` at ${pick.location}` : "") +
  ". We are coordinating airport transfers from Milan Malpensa; please confirm recommended pickup times and vendor contact for ground transport. Not a new inquiry — ongoing planning.";

/** Intake bias: classic new-lead wording → triage LLM should return intake. */
const bodyFallback =
  "Hello — we just got engaged and are looking for a wedding photographer for summer 2027 in Tuscany. " +
  "Could you send your packages and availability? This is our first message to you.";

async function sendHarnessIngress(sender, body, subject) {
  try {
    const r = await enqueueInboxThreadRequiresTriageV1({
      supabase,
      photographerId,
      weddingId: null,
      senderEmail: sender,
      subject,
      body,
      inngestKey,
      traceId: `bounded-mm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      source: "gmail_delta",
    });
    return { ok: true, status: 200, sendText: r.sendText.slice(0, 400), eventId: r.inngestEventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 500, sendText: msg.slice(0, 400), eventId: null };
  }
}

async function fetchEventRuns(evId) {
  const r = await fetch(`https://api.inngest.com/v1/events/${evId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
  });
  const t = await r.text();
  if (!r.ok) return { error: t.slice(0, 500), status: r.status };
  try {
    return { json: JSON.parse(t) };
  } catch {
    return { error: t };
  }
}

function runsListFromApiJson(json) {
  if (!json) return [];
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json)) return json;
  if (json.data && Array.isArray(json.data.runs)) return json.data.runs;
  return [];
}

function isTriageOutput(out) {
  return (
    out &&
    typeof out === "object" &&
    (out.wedding_resolution_trace !== undefined ||
      out.enforcedIntent !== undefined ||
      out.dispatch_intent !== undefined ||
      out.status === "routed" ||
      out.status === "unfiled")
  );
}

function pickTriageRun(list) {
  for (const run of list) {
    const out = run.output;
    if (!out || typeof out !== "object") continue;
    const fn = String(run.function_id ?? run.name ?? "");
    if (
      isTriageOutput(out) &&
      (fn.includes("traffic-cop") ||
        fn.includes("triage") ||
        fn.includes("inbox-thread") ||
        fn.includes("process-inbox"))
    ) {
      return { run, out };
    }
  }
  for (const run of list) {
    const out = run.output;
    if (isTriageOutput(out)) return { run, out };
  }
  for (const run of list) {
    if (run.status === "Completed" && run.output && typeof run.output === "object" && run.output.status === "routed") {
      return { run, out: run.output };
    }
  }
  return null;
}

async function pollTriageOutput(evId, label, maxMs = 180_000) {
  const deadline = Date.now() + maxMs;
  let iter = 0;
  while (Date.now() < deadline) {
    iter += 1;
    const fr = await fetchEventRuns(evId);
    if (fr.error) {
      console.warn(`[${label}] runs API:`, fr.status, fr.error);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const list = runsListFromApiJson(fr.json);
    if (iter === 1 || iter % 4 === 0) {
      const brief = list.map((r) => ({
        id: r.id,
        status: r.status,
        fn: r.function_id ?? r.name,
        hasOut: !!r.output,
      }));
      console.warn(`[${label}] poll #${iter} runs:`, JSON.stringify(brief));
    }
    const picked = pickTriageRun(list);
    if (picked) return picked;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

function summarizeOutput(out) {
  const w = out.wedding_resolution_trace ?? {};
  return {
    status: out.status,
    llmIntent: out.llmIntent,
    enforcedIntent: out.enforcedIntent,
    dispatch_intent: out.dispatch_intent,
    weddingId: out.weddingId,
    threadId: out.threadId,
    wedding_resolution_trace: w,
    bounded: w.bounded_unresolved_email_matchmaker ?? out.bounded_unresolved_email_matchmaker,
    intake_legacy_dispatch: out.intake_legacy_dispatch,
    main_path_concierge_live_dispatch: out.main_path_concierge_live_dispatch,
    cut4_live_correlation_id: out.cut4_live_correlation_id,
  };
}

console.log("--- Fixture context ---");
console.log(JSON.stringify({ photographerId, roster_pick: { id: pick.id, stage: pick.stage, couple_names: pick.couple_names } }, null, 2));

console.log("\n--- Case A: activation (unknown sender + logistics / roster-hint) ---");
console.log("sender:", unknownSenderA);
const sendA = await sendHarnessIngress(
  unknownSenderA,
  bodyActivation,
  "Bounded QA — logistics / unresolved matchmaker activation",
);
console.log("Inngest send:", sendA.status, sendA.sendText);
const pollA = await pollTriageOutput(sendA.eventId, "caseA");
if (pollA) {
  console.log("\n--- Case A triage output (summary) ---");
  console.log(JSON.stringify(summarizeOutput(pollA.out), null, 2));
  console.log("\n--- Case A raw output (full) ---");
  console.log(JSON.stringify(pollA.out, null, 2));
} else {
  console.warn("Case A: no triage output from API within timeout — check Inngest Cloud for event id:", sendA.eventId);
}

await new Promise((r) => setTimeout(r, 4000));

console.log("\n--- Case B: fallback (unknown sender + new-lead intake bias) ---");
console.log("sender:", unknownSenderB);
const sendB = await sendHarnessIngress(unknownSenderB, bodyFallback, "Bounded QA — cold lead intake fallback");
console.log("Inngest send:", sendB.status, sendB.sendText);
const pollB = await pollTriageOutput(sendB.eventId, "caseB");
if (pollB) {
  console.log("\n--- Case B triage output (summary) ---");
  console.log(JSON.stringify(summarizeOutput(pollB.out), null, 2));
  console.log("\n--- Case B raw output (full) ---");
  console.log(JSON.stringify(pollB.out, null, 2));
} else {
  console.warn("Case B: no triage output from API within timeout — check Inngest Cloud for event id:", sendB.eventId);
}

console.log("\n--- Done ---");
