/**
 * One-off CUT6 proof: read fixture, check wedding stage, enqueue `inbox/thread.requires_triage.v1`, poll drafts.
 * (Pre-ingress `comms/email.received` / `traffic-cop-triage` retired — harness uses post-ingest classifier.)
 *
 * Run: node scripts/cut6_proof_once.mjs
 * Requires .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY
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

const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));

const supabase = createClient(url, sr);

const weddingId = fixtures.weddingId;
const email = fixtures.email;

const { data: wedding, error: wErr } = await supabase
  .from("weddings")
  .select("id, stage, photographer_id")
  .eq("id", weddingId)
  .maybeSingle();

if (wErr) throw wErr;
console.log("Fixture wedding:", JSON.stringify(wedding, null, 2));

/**
 * Triage `deterministic-identity` resolves sender → clients.email → wedding_id → weddings.
 * Without this row, identity.weddingId stays null, photographer_id is not resolved, and
 * persist-thread-and-message throws. Production email ingress may also send data.photographer_id.
 */
async function ensureFixtureClientEmailMapsToWedding() {
  const { data: byEmail, error: e1 } = await supabase
    .from("clients")
    .select("id, email, wedding_id")
    .eq("email", email)
    .maybeSingle();

  if (e1) throw e1;

  if (byEmail?.wedding_id === weddingId) {
    console.log("Fixture client (by email): ok", JSON.stringify(byEmail, null, 2));
    return;
  }

  if (byEmail && byEmail.wedding_id !== weddingId) {
    const { error: up } = await supabase
      .from("clients")
      .update({ wedding_id: weddingId })
      .eq("id", byEmail.id);
    if (up) throw up;
    console.log("Updated client wedding_id for fixture email:", byEmail.id);
    return;
  }

  const { error: ins } = await supabase.from("clients").insert({
    wedding_id: weddingId,
    name: "QA CUT6 fixture client",
    email,
    role: "primary",
  });
  if (ins) throw ins;
  console.log("Inserted fixture client row for email → wedding");
}

await ensureFixtureClientEmailMapsToWedding();

const prevStage = wedding?.stage ?? null;
let restored = false;

const activeStages = new Set(["booked", "prep", "final_balance"]);
if (!activeStages.has(wedding?.stage)) {
  console.log("Temporarily setting stage to booked for logistics gate...");
  const { error: upErr } = await supabase.from("weddings").update({ stage: "booked" }).eq("id", weddingId);
  if (upErr) throw upErr;
  restored = true;
}

const body =
  "CUT6 proof — logistics only: we are flying into Milan Malpensa on Thursday for our Lake Como wedding weekend. " +
  "Please recommend hotels near the venue and options for airport transfer and ground transportation.";

let sendOk = false;
try {
  const r = await enqueueInboxThreadRequiresTriageV1({
    supabase,
    photographerId: fixtures.photographerId,
    weddingId,
    senderEmail: email,
    subject: "CUT6 E2E proof — hotels and transfers",
    body,
    inngestKey,
    traceId: `cut6-proof-${Date.now()}`,
    source: "manual",
  });
  console.log("Inngest send (inbox/thread.requires_triage.v1):", r.sendText.slice(0, 500));
  sendOk = true;
} catch (e) {
  console.error("Inngest send failed:", e instanceof Error ? e.message : e);
}

if (!sendOk) {
  if (restored) {
    await supabase.from("weddings").update({ stage: prevStage }).eq("id", weddingId);
  }
  process.exit(1);
}

console.log("Polling drafts for orchestrator marker (up to 120s)...");
const deadline = Date.now() + 120_000;
let found = null;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000));
  const { data: drafts, error: dErr } = await supabase
    .from("drafts")
    .select("id, status, body, thread_id, created_at")
    .eq("photographer_id", fixtures.photographerId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (dErr) throw dErr;
  const pending =
    "Reply draft pending — generated text will replace this when the writer runs successfully.";
  const legacy = "[Orchestrator draft — clientOrchestratorV1 QA path]";
  found = (drafts ?? []).find((d) => {
    const b = String(d.body ?? "");
    return b.includes(pending) || b.includes(legacy);
  });
  if (found) {
    console.log("Found orchestrator draft:", JSON.stringify(found, null, 2));
    break;
  }
  console.log("… no orchestrator draft yet, latest ids:", (drafts ?? []).map((d) => d.id));
}

if (restored && prevStage != null) {
  console.log("Restoring wedding stage to:", prevStage);
  await supabase.from("weddings").update({ stage: prevStage }).eq("id", weddingId);
}

if (!found) {
  console.error("Timed out waiting for orchestrator draft — check Inngest Cloud logs for inbox classifier + clientOrchestratorV1");
  process.exit(2);
}

console.log("CUT6 proof DB check: pending_approval draft id", found.id, "thread", found.thread_id);
