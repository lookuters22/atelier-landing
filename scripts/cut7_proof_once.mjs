/**
 * One-off CUT7 proof: main-path commercial + known wedding → orchestrator (draft_only).
 * Run: node scripts/cut7_proof_once.mjs
 * Requires .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY
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
    name: "QA CUT7 fixture client",
    email,
    role: "primary",
  });
  if (ins) throw ins;
  console.log("Inserted fixture client row for email → wedding");
}

await ensureFixtureClientEmailMapsToWedding();

/** Matches triage ALLOWED_INTENTS for `commercial` (pre_booking + active groups). */
const stagesAllowingCommercial = new Set([
  "inquiry",
  "consultation",
  "proposal_sent",
  "contract_out",
  "booked",
  "prep",
  "final_balance",
]);

const prevStage = wedding?.stage ?? null;
let restored = false;

if (!stagesAllowingCommercial.has(wedding?.stage)) {
  console.log("Temporarily setting stage to contract_out (commercial allowed in pre_booking)...");
  const { error: upErr } = await supabase.from("weddings").update({ stage: "contract_out" }).eq("id", weddingId);
  if (upErr) throw upErr;
  restored = true;
}

const proofToken = "CUT7PROOF-" + Date.now();
const body =
  `${proofToken} — CUT7 E2E proof. We need an updated quote for the 10-hour photography package, payment schedule for the remaining balance, ` +
  "and whether the retainer invoice can be sent this week.";

const event = {
  name: "comms/email.received",
  data: {
    photographer_id: fixtures.photographerId,
    raw_email: {
      from: email,
      body,
      subject: "CUT7 E2E proof — pricing and invoice",
    },
  },
};

const proofStartedAt = new Date(Date.now() - 5000).toISOString();

const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
const res = await fetch(ingestUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([event]),
});
const text = await res.text();
console.log("Inngest send:", res.status, text.slice(0, 500));

if (!res.ok) {
  if (restored && prevStage != null) {
    await supabase.from("weddings").update({ stage: prevStage }).eq("id", weddingId);
  }
  process.exit(1);
}

console.log("Polling drafts for orchestrator marker (up to 120s)...", { proofStartedAt, proofToken });
const deadline = Date.now() + 120_000;
let found = null;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000));
  const { data: drafts, error: dErr } = await supabase
    .from("drafts")
    .select("id, status, body, thread_id, created_at")
    .eq("photographer_id", fixtures.photographerId)
    .gte("created_at", proofStartedAt)
    .order("created_at", { ascending: false })
    .limit(10);
  if (dErr) throw dErr;
  const pending =
    "Reply draft pending — generated text will replace this when the writer runs successfully.";
  const legacy = "[Orchestrator draft — clientOrchestratorV1 QA path]";
  found = (drafts ?? []).find((d) => {
    const b = String(d.body ?? "");
    return (b.includes(pending) || b.includes(legacy)) && b.includes(proofToken);
  });
  if (found) {
    console.log("Found orchestrator draft:", JSON.stringify(found, null, 2));
    break;
  }
  console.log("… no matching orchestrator draft yet, candidates:", (drafts ?? []).length);
}

if (restored && prevStage != null) {
  console.log("Restoring wedding stage to:", prevStage);
  await supabase.from("weddings").update({ stage: prevStage }).eq("id", weddingId);
}

if (!found) {
  console.error("Timed out waiting for orchestrator draft — check Inngest Cloud logs for triage + clientOrchestratorV1");
  process.exit(2);
}

const threadId = found.thread_id;
const { count: outboundCount, error: outErr } = await supabase
  .from("messages")
  .select("id", { count: "exact", head: true })
  .eq("thread_id", threadId)
  .eq("direction", "out");
if (outErr) throw outErr;

console.log("CUT7 proof DB: draft", found.id, "status", found.status, "thread", threadId);
console.log("Outbound messages on thread (expect 0 for draft_only path):", outboundCount ?? 0);
