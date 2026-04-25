/**
 * E2E proof: `escalated_for_approval` with QA synthetic confidence (see UNFILED §4.3).
 * Ingress: `inbox/thread.requires_triage.v1` + `source: gmail_delta` (pre-ingress `comms/email.received` retired).
 *
 * Prereqs (Supabase Edge secrets on the target project):
 * - TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1=1
 * - TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1=1
 * - TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1=82 (or 75–89)
 * - INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1 unset (clean intake path)
 *
 * .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY
 *
 * Run: node scripts/bounded_near_match_escalation_e2e_proof.mjs
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

if (!url || !sr || !inngestKey) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or INNGEST_EVENT_KEY");
  process.exit(1);
}

const fixtures = JSON.parse(readFileSync(join(root, "supabase/functions/inngest/.qa_fixtures.json"), "utf8"));
const photographerId = fixtures.photographerId;
const supabase = createClient(url, sr);

const ts = Date.now();
const sender = `bounded_escal_${ts}@qa.atelier.test`;

const subject = "Re: Shuttle timing — existing booking (proof)";
const body = [
  "Hi — following up on ground transport for the wedding we already have booked with you.",
  "Shuttle vendor needs confirmation on Malpensa pickup time for our Tuscany August 2026 date.",
  "Ongoing logistics for the existing contract — not a new inquiry.",
].join(" ");

console.log("INPUT:", JSON.stringify({ sender, subject, body, photographer_id: photographerId }, null, 2));

try {
  const r = await enqueueInboxThreadRequiresTriageV1({
    supabase,
    photographerId,
    weddingId: null,
    senderEmail: sender,
    subject,
    body,
    inngestKey,
    traceId: `bounded-escal-${ts}`,
    source: "gmail_delta",
  });
  console.log("Inngest (inbox/thread.requires_triage.v1): ok", r.sendText.slice(0, 200));
} catch (e) {
  console.error("Inngest send failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}

const deadline = Date.now() + 120_000;
let escalation = null;
let threadRow = null;

while (Date.now() < deadline) {
  const { data: msgs } = await supabase
    .from("messages")
    .select("thread_id")
    .eq("sender", sender)
    .limit(1);

  const threadId = msgs?.[0]?.thread_id;
  if (threadId) {
    const { data: t } = await supabase
      .from("threads")
      .select("id, wedding_id, ai_routing_metadata")
      .eq("id", threadId)
      .single();
    threadRow = t;

    const { data: esc } = await supabase
      .from("escalation_requests")
      .select(
        "id, action_key, reason_code, operator_delivery, decision_justification, thread_id, status",
      )
      .eq("thread_id", threadId)
      .eq("reason_code", "bounded_matchmaker_near_match")
      .order("created_at", { ascending: false })
      .limit(1);

    if (esc?.length) {
      escalation = esc[0];
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}

console.log("\n--- thread ---");
console.log(JSON.stringify(threadRow, null, 2));
console.log("\n--- escalation_requests (bounded_matchmaker_near_match) ---");
console.log(JSON.stringify(escalation, null, 2));

const dj = escalation?.decision_justification;
const ok =
  threadRow &&
  threadRow.wedding_id == null &&
  escalation &&
  escalation.action_key === "request_thread_wedding_link" &&
  escalation.reason_code === "bounded_matchmaker_near_match" &&
  escalation.operator_delivery === "dashboard_only" &&
  dj &&
  typeof dj === "object" &&
  dj.candidate_wedding_id &&
  typeof dj.confidence_score === "number";

console.log("\nPROOF_CHECK:", ok ? "PASS" : "FAIL/incomplete");
