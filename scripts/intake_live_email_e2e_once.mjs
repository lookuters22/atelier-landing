/**
 * E2E: narrow live intake email — inbox/thread.requires_triage.v1 → ai/intent.intake → ai/orchestrator.client.v1
 * (no persona, no parity fanout on that turn when live gate is on).
 * Pre-ingress `comms/email.received` / `traffic-cop-triage` retired.
 *
 * Thread resolution uses multiple strategies (body marker → messages → threads by wedding → drafts),
 * because `threads` has no `created_at` in schema — ordering by invalid columns can yield empty results.
 *
 * Requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
 *
 * Run: node scripts/intake_live_email_e2e_once.mjs
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

if (!url || !sr || !inngestKey || !signingKey) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY, or INNGEST_SIGNING_KEY");
  process.exit(1);
}

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
const photographerId = fixtures.photographerId;
const sb = createClient(url, sr);

const ts = Date.now();
const senderEmail = `intake_live_e2e_${ts}@qa.atelier.test`;
/** Unique per run — find inbound message even if thread titles vary. */
const BODY_MARKER = `E2E_INTAKE_LIVE_MARKER_${ts}`;
const body =
  "Hello — we are newly engaged and looking for a photographer for a summer 2028 wedding in Tuscany. " +
  "Could you share your packages and availability? " +
  BODY_MARKER;

const runStartedAt = new Date().toISOString();

let eventId = null;
try {
  const r = await enqueueInboxThreadRequiresTriageV1({
    supabase: sb,
    photographerId,
    weddingId: null,
    senderEmail,
    subject: "Live intake email E2E — new inquiry",
    body,
    inngestKey,
    traceId: `intake-live-${ts}`,
    source: "manual",
  });
  console.log("Inngest send (inbox/thread.requires_triage.v1): ok", r.sendText.slice(0, 400));
  eventId = r.inngestEventId;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
console.log("inbox/thread.requires_triage.v1 event id:", eventId);
console.log("senderEmail:", senderEmail);
console.log("BODY_MARKER:", BODY_MARKER);
console.log("runStartedAt (ISO):", runStartedAt);

async function fetchEventRuns(evId) {
  const r = await fetch(`https://api.inngest.com/v1/events/${evId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
  });
  const t = await r.text();
  if (!r.ok) {
    console.warn("runs API", r.status, t.slice(0, 500));
    return null;
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function runsList(j) {
  if (!j) return [];
  if (Array.isArray(j.data)) return j.data;
  if (j.data && Array.isArray(j.data.runs)) return j.data.runs;
  if (Array.isArray(j)) return j;
  return [];
}

function deepFind(obj, pred) {
  if (obj == null) return null;
  if (typeof obj !== "object") return null;
  if (pred(obj)) return obj;
  for (const v of Object.values(obj)) {
    const f = deepFind(v, pred);
    if (f) return f;
  }
  return null;
}

/** Poll Inngest parent event runs JSON for nested orchestrator / intake outputs. */
async function pollInngestArtifacts(maxMs = 300_000) {
  const deadline = Date.now() + maxMs;
  let lastRaw = "";
  while (Date.now() < deadline) {
    const j = await fetchEventRuns(eventId);
    lastRaw = JSON.stringify(j);
    const liveObs = deepFind(
      j,
      (o) =>
        o &&
        typeof o === "object" &&
        o.intake_post_bootstrap_live_email_observation &&
        o.intake_post_bootstrap_live_email_observation.compare_kind,
    );
    if (liveObs?.intake_post_bootstrap_live_email_observation) {
      return {
        intakeObservation: liveObs.intake_post_bootstrap_live_email_observation,
        fullOrchestratorOutput: liveObs,
        runsJsonSample: lastRaw.slice(0, 12000),
      };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { intakeObservation: null, fullOrchestratorOutput: null, runsJsonSample: lastRaw.slice(0, 12000) };
}

/**
 * Resolve lead thread_id after client+wedding exist.
 * Old harness failed when `.order("created_at")` was used on `threads` — column may not exist → empty data.
 */
async function resolveLeadThreadId(sb, { weddingId }) {
  const trace = [];

  // 1) Inbound message with unique body marker (intake copies raw_message into messages.body)
  const m1 = await sb
    .from("messages")
    .select("id,thread_id,body,sender,direction")
    .eq("photographer_id", photographerId)
    .ilike("body", `%${BODY_MARKER}%`)
    .limit(5);
  trace.push({
    strategy: "messages_ilike_body_marker",
    error: m1.error?.message ?? null,
    rowCount: m1.data?.length ?? 0,
    sample: m1.data?.[0] ?? null,
  });
  const tid1 = m1.data?.[0]?.thread_id;
  if (tid1) {
    return { threadId: tid1, trace, method: "messages_ilike_body_marker" };
  }

  // 2) Inbound message by sender email (intake sets sender to sender_email)
  const m2 = await sb
    .from("messages")
    .select("id,thread_id,body,sender,direction")
    .eq("photographer_id", photographerId)
    .eq("sender", senderEmail)
    .order("sent_at", { ascending: false })
    .limit(10);
  trace.push({
    strategy: "messages_eq_sender_email",
    error: m2.error?.message ?? null,
    rowCount: m2.data?.length ?? 0,
    sample: m2.data?.[0] ?? null,
  });
  const inbound = (m2.data ?? []).find((r) => r.direction === "in");
  if (inbound?.thread_id) {
    return { threadId: inbound.thread_id, trace, method: "messages_eq_sender_inbound" };
  }

  // 3) Threads for wedding — order by last_activity_at (schema has no created_at on threads in types)
  const t1 = await sb
    .from("threads")
    .select("id,title,wedding_id,last_activity_at")
    .eq("wedding_id", weddingId)
    .order("last_activity_at", { ascending: false });
  trace.push({
    strategy: "threads_eq_wedding_id_order_last_activity_at",
    error: t1.error?.message ?? null,
    rowCount: t1.data?.length ?? 0,
    rows: t1.data ?? [],
  });
  const prefer =
    t1.data?.find((t) => String(t.title ?? "").toLowerCase().includes("initial inquiry")) ?? t1.data?.[0];
  if (prefer?.id) {
    return { threadId: prefer.id, trace, method: "threads_by_wedding_id" };
  }

  // 4) Recent drafts for photographer with orchestrator marker → thread_id
  const d1 = await sb
    .from("drafts")
    .select("id,thread_id,created_at,body,instruction_history")
    .eq("photographer_id", photographerId)
    .gte("created_at", runStartedAt)
    .order("created_at", { ascending: false })
    .limit(20);
  trace.push({
    strategy: "drafts_since_run_started_orchestrator_hint",
    error: d1.error?.message ?? null,
    rowCount: d1.data?.length ?? 0,
  });
  const orchDraft = (d1.data ?? []).find((d) => {
    const b = String(d.body ?? "");
    return (
      JSON.stringify(d.instruction_history ?? "").includes("client_orchestrator_v1") ||
      b.includes("[Orchestrator draft — clientOrchestratorV1 QA path]") ||
      b.includes(
        "Reply draft pending — generated text will replace this when the writer runs successfully.",
      )
    );
  });
  if (orchDraft?.thread_id) {
    return { threadId: orchDraft.thread_id, trace, method: "drafts_orchestrator_thread_id" };
  }

  return { threadId: null, trace, method: null };
}

console.log("\n--- Poll DB for client (up to 6 min) ---");
let clientRow = null;
for (let i = 0; i < 72; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const { data: c, error: cErr } = await sb
    .from("clients")
    .select("id,wedding_id,email")
    .eq("email", senderEmail.toLowerCase())
    .maybeSingle();
  if (cErr) console.log("clients poll error:", cErr.message);
  if (c?.wedding_id) {
    clientRow = c;
    break;
  }
  process.stdout.write(".");
}
console.log("");

if (!clientRow) {
  console.error("No client row — intake did not complete or email mismatch.");
  const ing = await pollInngestArtifacts(15_000);
  console.log("Inngest sample (truncated):", ing.runsJsonSample?.slice(0, 2000));
  process.exit(2);
}

const weddingId = clientRow.wedding_id;
console.log("clientRow:", JSON.stringify(clientRow, null, 2));
console.log("weddingId:", weddingId);

console.log("\n--- Resolve thread_id (multi-strategy) ---");
const resolved = await resolveLeadThreadId(sb, { weddingId });
console.log(JSON.stringify({ threadId: resolved.threadId, method: resolved.method, trace: resolved.trace }, null, 2));

const threadId = resolved.threadId;
if (!threadId) {
  console.error("Could not resolve thread_id — see trace above.");
  process.exit(2);
}

const ing = await pollInngestArtifacts(300_000);
const obs = ing.intakeObservation;
const rawRuns = ing.runsJsonSample ?? "";

console.log("\n--- Inngest: checklist strings (parent event runs JSON substring search) ---");
const checks = {
  intake_live_status_in_json: rawRuns.includes("facts_extracted_live_orchestrator_post_bootstrap_email"),
  intake_live_correlation_id_in_json: /"intakeLiveCorrelationId"\s*:\s*"[^"]+"/.test(rawRuns),
  orchestrator_live_obs_in_json: rawRuns.includes("intake_post_bootstrap_live_email_observation"),
  parity_fanout_in_json: rawRuns.includes("intake_post_bootstrap_parity"),
  persona_draft_pending_in_json: rawRuns.includes("draft_pending_approval") && rawRuns.includes("persona"),
};
console.log(JSON.stringify(checks, null, 2));

console.log("\n--- intake_post_bootstrap_live_email_observation (parsed from tree, if any) ---");
console.log(obs ? JSON.stringify(obs, null, 2) : "(not found nested under parent event id — check checks.* above)");

console.log("\n--- Drafts on resolved thread since runStartedAt ---");
const { data: drafts, error: dErr } = await sb
  .from("drafts")
  .select("id,status,created_at,body,instruction_history")
  .eq("thread_id", threadId)
  .gte("created_at", runStartedAt)
  .order("created_at", { ascending: true });
if (dErr) console.log("drafts query error:", dErr.message);
console.log("draft rows:", drafts?.length ?? 0, dErr ? `(error: ${dErr.message})` : "");

function classify(d) {
  const h = JSON.stringify(d.instruction_history ?? "");
  if (h.includes("persona_agent")) return "persona";
  const b = String(d.body ?? "");
  if (
    h.includes("client_orchestrator_v1") ||
    b.includes("[Orchestrator draft — clientOrchestratorV1 QA path]") ||
    b.includes(
      "Reply draft pending — generated text will replace this when the writer runs successfully.",
    )
  ) {
    return "orchestrator";
  }
  return "other";
}

const byKind = { persona: [], orchestrator: [], other: [] };
for (const d of drafts ?? []) {
  byKind[classify(d)].push(d);
}

console.log("persona drafts:", byKind.persona.length);
console.log("orchestrator drafts:", byKind.orchestrator.length);
if (byKind.orchestrator[0]) {
  console.log("orchestrator draft id:", byKind.orchestrator[0].id, "status:", byKind.orchestrator[0].status);
}

console.log("\n--- Outbound messages on thread since runStartedAt (messages.sent_at) ---");
const { data: outMsgsSent, error: oErr } = await sb
  .from("messages")
  .select("id,direction,sent_at,body")
  .eq("thread_id", threadId)
  .eq("direction", "out")
  .gte("sent_at", runStartedAt);
if (oErr) console.log("messages out query error:", oErr.message);
console.log("out count:", outMsgsSent?.length ?? 0);

const parityInRuns = rawRuns.includes("intake_post_bootstrap_parity");
const personaDraftOk = byKind.persona.length === 0;
const orchDraftOk = byKind.orchestrator.length >= 1;
const pendingOk = byKind.orchestrator.some((d) => d.status === "pending_approval");
const noOutbound = (outMsgsSent?.length ?? 0) === 0;

const verdict = {
  thread_resolution_method: resolved.method,
  inngest_live_observation_parsed: !!obs,
  checks,
  parity_marker_in_parent_runs_json: parityInRuns,
  persona_drafts_on_thread: byKind.persona.length,
  orchestrator_drafts_on_thread: byKind.orchestrator.length,
  pending_approval_orchestrator_draft: pendingOk,
  outbound_messages: outMsgsSent?.length ?? 0,
  draft_id_sample: byKind.orchestrator[0]?.id ?? null,
  draftCreated_from_obs: obs?.draftCreated,
  draftSkipReason_from_obs: obs?.draftSkipReason,
  neitherDraftNorEscalationReason_from_obs: obs?.neitherDraftNorEscalationReason,
  rollback_suggested_no_visible_outcome: obs?.rollback_suggested_no_visible_outcome,
  rollback_suggested_verifier_blocked: obs?.rollback_suggested_verifier_blocked,
  viable_db:
    personaDraftOk &&
    orchDraftOk &&
    pendingOk &&
    noOutbound,
};

verdict.viable_full =
  verdict.viable_db &&
  checks.intake_live_status_in_json &&
  checks.orchestrator_live_obs_in_json &&
  !checks.parity_fanout_in_json &&
  !checks.persona_draft_pending_in_json;

console.log("\n--- Verdict ---");
console.log(JSON.stringify(verdict, null, 2));

process.exit(verdict.viable_full ? 0 : verdict.viable_db ? 4 : 3);
