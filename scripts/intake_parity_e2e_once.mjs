/**
 * E2E: intake post-bootstrap orchestrator parity (observation-only, non-mutating).
 *
 * Requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY
 * Optional: INNGEST_SIGNING_KEY — poll Inngest Cloud runs API
 *
 * Run: node scripts/intake_parity_e2e_once.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
  process.env.INNGEST_SIGNING_KEY ||
  process.env.INGEST_SINGIN_KEY ||
  process.env.INGEST_SIGNING_KEY;

if (!url || !sr || !inngestKey) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or INNGEST_EVENT_KEY");
  process.exit(1);
}

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));
const photographerId = fixtures.photographerId;

const senderEmail = `intake_parity_e2e_${Date.now()}@qa.atelier.test`;
const body =
  "Hello — we are newly engaged and looking for a photographer for a summer 2028 wedding in Tuscany. " +
  "Could you share your packages and availability?";

const event = {
  name: "comms/email.received",
  data: {
    photographer_id: photographerId,
    raw_email: {
      from: senderEmail,
      body,
      subject: "Intake parity E2E — new inquiry",
    },
  },
};

const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
const res = await fetch(ingestUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([event]),
});
const sendText = await res.text();
console.log("Inngest send:", res.status, sendText.slice(0, 400));

if (!res.ok) {
  console.error(sendText);
  process.exit(1);
}

let eventId = null;
try {
  const j = JSON.parse(sendText);
  eventId = j.ids?.[0] ?? null;
} catch {
  /* ignore */
}

console.log("Event id:", eventId);
console.log("Fixture sender (unknown lead → intake):", senderEmail);

async function fetchEventRuns(evId) {
  if (!signingKey || !evId) return null;
  const r = await fetch(`https://api.inngest.com/v1/events/${evId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
  });
  const t = await r.text();
  if (!r.ok) {
    console.warn("Inngest runs API:", r.status, t.slice(0, 400));
    return null;
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function runsListFromApiJson(json) {
  if (!json) return [];
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json)) return json;
  if (json.data && Array.isArray(json.data.runs)) return json.data.runs;
  return [];
}

function deepFindIntakeParity(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.intake_post_bootstrap_parity_observation) return obj.intake_post_bootstrap_parity_observation;
  for (const v of Object.values(obj)) {
    const f = deepFindIntakeParity(v);
    if (f) return f;
  }
  return null;
}

function summarizeRun(run) {
  const fn = run.function_id ?? run.functionId ?? run.name ?? "?";
  const st = run.status ?? "?";
  const out = run.output;
  const parity = deepFindIntakeParity(out);
  return { fn, st, hasParityObservation: !!parity, outputKeys: out && typeof out === "object" ? Object.keys(out) : [] };
}

/** Poll until orchestrator run exposes intake parity observation or timeout. */
async function pollOrchestratorParity(evId, maxMs = 240_000) {
  const deadline = Date.now() + maxMs;
  const seen = new Map();
  while (Date.now() < deadline) {
    const json = await fetchEventRuns(evId);
    const list = runsListFromApiJson(json);
    for (const run of list) {
      const id = run.id ?? run.run_id ?? JSON.stringify(run).slice(0, 80);
      const parity = deepFindIntakeParity(run.output);
      if (parity) {
        return { run, parity, allRuns: list };
      }
      seen.set(id, summarizeRun(run));
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { run: null, parity: null, allRuns: [], seenSummaries: [...seen.values()] };
}

const supabase = createClient(url, sr);

let parityResult = { run: null, parity: null, allRuns: [] };
if (!signingKey) {
  console.warn("INNGEST_SIGNING_KEY missing — cannot poll orchestrator output from API.");
} else {
  parityResult = await pollOrchestratorParity(eventId);
}

console.log("\n--- Inngest parity poll ---");
if (parityResult.parity) {
  console.log(JSON.stringify(parityResult.parity, null, 2));
} else {
  console.log("No intake_post_bootstrap_parity_observation in polled runs (see timing or signing key).");
  if (parityResult.seenSummaries?.length) {
    console.log("Sample run summaries:", JSON.stringify(parityResult.seenSummaries.slice(0, 8), null, 2));
  }
}

/** DB: resolve thread after intake + persona. */
console.log("\n--- DB poll (client + drafts) — up to 120s ---");
let threadId = null;
let weddingId = null;
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const { data: c } = await supabase.from("clients").select("id, wedding_id, email").eq("email", senderEmail).maybeSingle();
  if (c?.wedding_id) {
    weddingId = c.wedding_id;
    const { data: threads } = await supabase
      .from("threads")
      .select("id, title")
      .eq("wedding_id", weddingId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (threads?.length) {
      threadId = threads[0].id;
    }
    break;
  }
  process.stdout.write(".");
}
console.log("");

if (!threadId) {
  console.log("Could not resolve thread_id — intake may still be running or failed (check OpenAI/Inngest logs).");
  process.exit(parityResult.parity ? 0 : 2);
}

console.log("thread_id:", threadId, "wedding_id:", weddingId);

const { data: drafts } = await supabase
  .from("drafts")
  .select("id, created_at, body, instruction_history")
  .eq("thread_id", threadId)
  .order("created_at", { ascending: true });

const orchDrafts =
  drafts?.filter((d) => {
    const h = JSON.stringify(d.instruction_history ?? "");
    const b = String(d.body ?? "");
    return (
      h.includes("client_orchestrator_v1") ||
      b.includes("[Orchestrator draft — clientOrchestratorV1 QA path]") ||
      b.includes(
        "Reply draft pending — generated text will replace this when the writer runs successfully.",
      )
    );
  }) ?? [];

const personaDrafts =
  drafts?.filter((d) => {
    const h = JSON.stringify(d.instruction_history ?? "");
    return h.includes("persona_agent");
  }) ?? [];

console.log("\n--- Drafts on thread ---");
console.log("total:", drafts?.length ?? 0);
console.log("orchestrator-styled (client_orchestrator_v1 / marker):", orchDrafts.length);
console.log("persona_agent:", personaDrafts.length);

const p = parityResult.parity;
const verdict = {
  parity_observation_from_api: !!p,
  db_orchestrator_drafts_on_thread: orchDrafts.length,
  db_persona_drafts: personaDrafts.length,
  non_mutating_ok:
    !!p &&
    p.draftCreated === false &&
    p.escalationArtifactCreated === false &&
    p.dbSideEffectsSuppressed === true &&
    p.draftSkipReason === "intake_post_bootstrap_parity_observation_only" &&
    orchDrafts.length === 0,
};

console.log("\n--- Verdict object ---");
console.log(JSON.stringify(verdict, null, 2));

process.exit(verdict.non_mutating_ok && verdict.db_orchestrator_drafts_on_thread === 0 ? 0 : 3);
