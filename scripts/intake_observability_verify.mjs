/**
 * Post-CUT8 intake planning verification: behavior preservation + intake_legacy_dispatch on triage return.
 * Requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY
 * Optional: INNGEST_SIGNING_KEY (or typo alias INGEST_SINGIN_KEY) — Inngest Cloud REST API for triage output
 *
 * Run: node scripts/intake_observability_verify.mjs
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

/** Unknown sender → no clients.wedding_id → enforceStageGate forces intake. */
const senderEmail = `intake_verify_${Date.now()}@qa.atelier.test`;
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
      subject: "Intake observability verify — new inquiry",
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
console.log("Inngest send:", res.status, sendText.slice(0, 300));

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

/** Poll for triage run output (function id contains traffic-cop or name in metadata). */
async function pollTriageOutput(evId, maxMs = 120_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const json = await fetchEventRuns(evId);
    const list = runsListFromApiJson(json);
    for (const run of list) {
      const out = run.output;
      if (
        out &&
        typeof out === "object" &&
        out.status === "routed" &&
        out.intake_legacy_dispatch === "ai/intent.intake"
      ) {
        return { run, source: "triage_intake" };
      }
    }
    for (const run of list) {
      const out = run.output;
      if (out && typeof out === "object" && (out.enforcedIntent !== undefined || out.intake_legacy_dispatch)) {
        return { run, source: "output_shape" };
      }
    }
    for (const run of list) {
      if (run.status === "Completed" && run.output) {
        return { run, source: "any_completed" };
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

console.log("Event id:", eventId);
console.log("Verify sender email (unknown lead → enforced intake):", senderEmail);

if (!signingKey) {
  console.warn(
    "INNGEST_SIGNING_KEY not set — cannot auto-fetch triage output. Set it in .env to poll API, or check Inngest Cloud UI.",
  );
} else {
  const tri = await pollTriageOutput(eventId);
  if (tri?.run?.output) {
    const o = tri.run.output;
    console.log("\n--- Triage output (from Inngest API) ---");
    console.log(
      JSON.stringify(
        {
          status: o.status,
          enforcedIntent: o.enforcedIntent,
          llmIntent: o.llmIntent,
          intake_legacy_dispatch: o.intake_legacy_dispatch,
          threadId: o.threadId,
          shadow_orchestrator: o.shadow_orchestrator,
        },
        null,
        2,
      ),
    );
    const ok =
      o.intake_legacy_dispatch === "ai/intent.intake" &&
      o.enforcedIntent === "intake" &&
      o.status === "routed";
    console.log("\nChecks:", {
      intake_legacy_dispatch_ok: o.intake_legacy_dispatch === "ai/intent.intake",
      enforced_intake: o.enforcedIntent === "intake",
      shadow_skipped_intake:
        o.shadow_orchestrator?.status === "skipped_intake" || o.shadow_orchestrator?.status === undefined,
    });
    if (!ok) {
      console.warn("Unexpected triage output shape — inspect full output above.");
    }
  } else {
    console.warn("Could not retrieve triage run output via API (fan-out or timing). Check Inngest dashboard.");
  }
}

/** Legacy intake should create a client + wedding (inquiry) for this sender path. */
const supabase = createClient(url, sr);
console.log("\n--- DB spot-check (legacy intake worker) — polling up to 90s ---");
let clients = null;
for (let i = 0; i < 18; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const { data: c } = await supabase
    .from("clients")
    .select("id, wedding_id, email")
    .eq("email", senderEmail)
    .maybeSingle();
  if (c) {
    clients = c;
    break;
  }
  process.stdout.write(".");
}
console.log("");
console.log("Client row for verify email:", clients ?? "(not found — check intake worker / OpenAI errors in logs)");

if (clients?.wedding_id) {
  const { data: w } = await supabase
    .from("weddings")
    .select("id, stage, couple_names")
    .eq("id", clients.wedding_id)
    .maybeSingle();
  console.log("Wedding from intake:", w);
  console.log("\nVerdict (DB): legacy intake created lead records — behavior consistent with intake worker.");
} else {
  console.log("\nVerdict (DB): could not confirm lead creation — investigate intake worker or extend wait.");
}
