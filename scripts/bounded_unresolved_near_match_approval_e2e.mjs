/**
 * E2E proof: bounded unresolved near-match → photographer approval escalation.
 * Ingress: `inbox/thread.requires_triage.v1` with `source: gmail_delta` (pre-ingress `comms/email.received` retired).
 *
 * Prereqs:
 * - Secrets: TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1=1, TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1=1
 * - .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
 *
 * Run: node scripts/bounded_unresolved_near_match_approval_e2e.mjs
 *
 * Case N: unknown sender + non-intake logistics body with deliberate ambiguity so matchmaker may land in [75,90).
 * Case L: intake-biased cold lead → matchmaker skipped; intake dispatch expected.
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
  console.error("No active weddings for photographer — cannot build roster-hinted body");
  process.exit(1);
}

const ts = Date.now();
const unknownSenderN = `bounded_near_${ts}@qa.atelier.test`;
const unknownSenderL = `bounded_low_${ts}@qa.atelier.test`;

/**
 * Strong roster anchors but explicit uncertainty — aims for matchmaker confidence in [75, 90)
 * without crossing the "exact match" bar in the system prompt.
 */
const bodyNearMatch = [
  "Logistics coordination — not a new lead.",
  `We are finalizing ground transport for a wedding that might be ${pick.couple_names ?? "one of your couples"} — our vendor list shows similar names across two of your active bookings.`,
  pick.wedding_date
    ? `The date we have is around ${String(pick.wedding_date).slice(0, 10)} but our spreadsheet is messy.`
    : "",
  pick.location ? `Venue/area context: ${pick.location}.` : "",
  "Please confirm which wedding file this email thread should be associated with before we lock vendor holds — we are not 100% certain which roster entry applies.",
  "Reply with the correct wedding reference so we can proceed with shuttle timing.",
]
  .filter(Boolean)
  .join(" ");

const bodyLowConfidence = [
  "Hello — we just got engaged and are looking for a wedding photographer for summer 2027 in Tuscany.",
  "Could you send your packages and availability? This is our first message to you.",
].join(" ");

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
      traceId: `bounded-near-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

function pickOperatorDeliveryRun(list) {
  for (const run of list) {
    const fn = String(run.function_id ?? run.name ?? "");
    if (!fn.includes("operator-escalation") && !fn.includes("escalation-delivery")) continue;
    if (run.status === "Completed" && run.output) return { run, out: run.output };
  }
  for (const run of list) {
    const fn = String(run.function_id ?? run.name ?? "");
    if (fn.includes("operator-escalation") || fn.includes("escalation-delivery")) {
      return { run, out: run.output ?? null };
    }
  }
  return null;
}

async function pollTriageOutput(evId, label, maxMs = 240_000) {
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
    if (iter === 1 || iter % 5 === 0) {
      const brief = list.map((r) => ({
        id: r.id,
        status: r.status,
        fn: r.function_id ?? r.name,
        hasOut: !!r.output,
      }));
      console.warn(`[${label}] poll #${iter} runs:`, JSON.stringify(brief));
    }
    const picked = pickTriageRun(list);
    if (picked) return { ...picked, allRuns: list };
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

async function fetchEscalationRow(id) {
  const { data, error } = await supabase
    .from("escalation_requests")
    .select(
      "id, action_key, reason_code, operator_delivery, decision_justification, thread_id, wedding_id, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function summarizeOutput(out) {
  const w = out.wedding_resolution_trace ?? {};
  const bu = w.bounded_unresolved_email_matchmaker ?? {};
  return {
    status: out.status,
    llmIntent: out.llmIntent,
    enforcedIntent: out.enforcedIntent,
    dispatch_intent: out.dispatch_intent,
    weddingId: out.weddingId,
    threadId: out.threadId,
    intake_skipped_for_near_match_escalation: out.intake_skipped_for_near_match_escalation,
    unresolved_match_approval_escalation_id: w.unresolved_match_approval_escalation_id,
    bounded_outcome: bu.outcome,
    wedding_resolution_trace_keys: Object.keys(w),
  };
}

console.log("--- Fixture context ---");
console.log(
  JSON.stringify(
    { photographerId, roster_pick: { id: pick.id, stage: pick.stage, couple_names: pick.couple_names } },
    null,
    2,
  ),
);

console.log("\n--- Case N: near-match band attempt (ambiguous logistics + roster hints) ---");
console.log("sender:", unknownSenderN);
const sendN = await sendHarnessIngress(
  unknownSenderN,
  bodyNearMatch,
  "Bounded QA — near-match approval escalation (ambiguous file)",
);
console.log("Inngest send:", sendN.status, sendN.sendText);
const pollN = await pollTriageOutput(sendN.eventId, "caseN");
if (pollN) {
  console.log("\n--- Case N triage summary ---");
  console.log(JSON.stringify(summarizeOutput(pollN.out), null, 2));
  console.log("\n--- Case N operator-escalation-delivery run (same event graph) ---");
  const od = pickOperatorDeliveryRun(pollN.allRuns ?? []);
  console.log(od ? JSON.stringify({ status: od.run.status, output: od.out }, null, 2) : "(no matching run in poll yet — may complete after triage)");

  const escId = pollN.out?.wedding_resolution_trace?.unresolved_match_approval_escalation_id;
  if (escId) {
    const row = await fetchEscalationRow(escId);
    console.log("\n--- escalation_requests row (service role) ---");
    console.log(JSON.stringify(row, null, 2));
  } else {
    console.log("\n--- No unresolved_match_approval_escalation_id on trace (near-match path not taken or not deployed) ---");
  }

  console.log("\n--- Case N full triage output ---");
  console.log(JSON.stringify(pollN.out, null, 2));
} else {
  console.warn("Case N: no triage output within timeout — event id:", sendN.eventId);
}

await new Promise((r) => setTimeout(r, 5000));

console.log("\n--- Case L: low-confidence / intake fallback (cold lead) ---");
console.log("sender:", unknownSenderL);
const sendL = await sendHarnessIngress(unknownSenderL, bodyLowConfidence, "Bounded QA — cold lead intake fallback");
console.log("Inngest send:", sendL.status, sendL.sendText);
const pollL = await pollTriageOutput(sendL.eventId, "caseL");
if (pollL) {
  console.log("\n--- Case L triage summary ---");
  console.log(JSON.stringify(summarizeOutput(pollL.out), null, 2));
  console.log("\n--- Case L full triage output ---");
  console.log(JSON.stringify(pollL.out, null, 2));
} else {
  console.warn("Case L: no triage output within timeout — event id:", sendL.eventId);
}

console.log("\n--- Done ---");
