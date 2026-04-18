/**
 * Isolated proof: single `ai/orchestrator.client.v1` with intake parity fields.
 * Inngest `/v1/events/{id}/runs` should include the orchestrator run for this event.
 *
 * Requires: INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

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
const signingKey = process.env.INNGEST_SIGNING_KEY || process.env.INGEST_SINGIN_KEY;

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));

if (!url || !sr || !inngestKey || !signingKey) {
  console.error("Missing env: URL, SR, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY");
  process.exit(1);
}

const threadId = fixtures.threadId;
const weddingId = fixtures.weddingId;
const photographerId = fixtures.photographerId;

const intakeParityCorrelationId = randomUUID();
const ev = {
  name: "ai/orchestrator.client.v1",
  data: {
    schemaVersion: 1,
    photographerId,
    weddingId,
    threadId,
    replyChannel: "email",
    rawMessage: "Isolated intake parity probe — ignore.",
    requestedExecutionMode: "draft_only",
    intakeParityCorrelationId,
    intakeParityFanoutSource: "intake_post_bootstrap_parity",
  },
};

const runStartedAt = new Date().toISOString();

const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
const res = await fetch(ingestUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([ev]),
});
const sendText = await res.text();
console.log("Send:", res.status, sendText.slice(0, 200));
if (!res.ok) process.exit(1);

let eventId = null;
try {
  eventId = JSON.parse(sendText).ids?.[0] ?? null;
} catch {
  /* */
}
console.log("event id:", eventId);

async function fetchRuns(evId) {
  const r = await fetch(`https://api.inngest.com/v1/events/${evId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
  });
  const t = await r.text();
  if (!r.ok) {
    console.error("runs API", r.status, t.slice(0, 400));
    return null;
  }
  return JSON.parse(t);
}

function runsList(j) {
  if (!j) return [];
  if (Array.isArray(j.data)) return j.data;
  if (j.data && Array.isArray(j.data.runs)) return j.data.runs;
  return [];
}

let parity = null;
let fullOut = null;
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const j = await fetchRuns(eventId);
  const list = runsList(j);
  for (const run of list) {
    const out = run.output;
    if (out && typeof out === "object" && out.intake_post_bootstrap_parity_observation) {
      parity = out.intake_post_bootstrap_parity_observation;
      fullOut = out;
      break;
    }
  }
  if (parity) break;
}

console.log("\n--- intake_post_bootstrap_parity_observation ---");
console.log(JSON.stringify(parity, null, 2));

const sb = createClient(url, sr);
const { data: afterRows } = await sb
  .from("drafts")
  .select("id,created_at,body,instruction_history")
  .eq("thread_id", threadId)
  .gte("created_at", runStartedAt);

const orch = (afterRows ?? []).filter((d) => {
  const h = JSON.stringify(d.instruction_history ?? "");
  const b = String(d.body ?? "");
  return (
    h.includes("client_orchestrator_v1") ||
    b.includes("[Orchestrator draft — clientOrchestratorV1 QA path]") ||
    b.includes(
      "Reply draft pending — generated text will replace this when the writer runs successfully.",
    )
  );
});

console.log("\n--- DB: orchestrator-style drafts on fixture thread since before ---");
console.log("orchestrator-marked count:", orch.length);

const ok =
  parity &&
  parity.dbSideEffectsSuppressed === true &&
  parity.draftSkipReason === "intake_post_bootstrap_parity_observation_only" &&
  parity.draftCreated === false &&
  parity.escalationArtifactCreated === false &&
  orch.length === 0;

console.log("\n--- Verdict (isolated orchestrator) ---");
console.log(JSON.stringify({ ok, intakeParityCorrelationId_sent: intakeParityCorrelationId }, null, 2));

process.exit(ok ? 0 : 4);
