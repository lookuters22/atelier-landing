/**
 * V3 — **narrow hosted Inngest proof** for `clientOrchestratorV1` (true Event API → deployed worker).
 *
 * Unlike `npm run v3:real-thread-replay-proof` (calls `executeClientOrchestratorV1Core` in-process), this script:
 * - POSTs a real `ai/orchestrator.client.v1` event to Inngest Cloud (`https://inn.gs/e/<INNGEST_EVENT_KEY>`)
 * - lets the deployed `inngest` Edge Function run `clientOrchestratorV1Function` with real `step.run(...)` boundaries
 * - verifies **downstream DB evidence** (draft row + `instruction_history`), not HTTP 200 alone.
 *
 * **Scenario (single):** `inquiry_warm_onboarding` from {@link seedInquiryWritingQaScenario} — minimal client-visible
 * inquiry thread + correlation token in `rawMessage` (same fixture family as inquiry-writing hosted QA).
 *
 * Prerequisites:
 * 1. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`
 * 2. `supabase/functions/inngest/.qa_fixtures.json` with `photographerId`
 * 3. `npm run deploy:inngest` against the same Supabase project (worker must match repo)
 * 4. DB schema compatible with deployed worker (e.g. migrations applied for columns the loader selects)
 *
 * Run:
 *   npm run v3:proof-orchestrator-inngest-hosted
 *   npm run deploy:inngest && npm run v3:proof-orchestrator-inngest-hosted
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  cleanupInquiryWritingQaLoose,
  seedInquiryWritingQaScenario,
} from "./v3_inquiry_writing_qa_seed.ts";

const ORCHESTRATOR_EVENT = "ai/orchestrator.client.v1" as const;
const SCHEMA_VERSION = 1 as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseEnvLines(content: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.push({ key: k, value: v });
  }
  return out;
}

function loadEnv(): void {
  for (const rel of [".env", join("supabase", ".env")]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const { key: k, value: v } of parseEnvLines(readFileSync(p, "utf8"))) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

function settleMaxAttempts(): number {
  const raw = process.env.V3_ORCH_INGEST_HOSTED_SETTLE_MAX_ATTEMPTS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 45;
}

function settleDelayMs(): number {
  const raw = process.env.V3_ORCH_INGEST_HOSTED_SETTLE_DELAY_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 200) return n;
  return 2000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function instructionHistorySteps(instructionHistory: unknown): string[] {
  const arr = Array.isArray(instructionHistory) ? instructionHistory : [];
  return arr
    .map((e) => (e && typeof (e as { step?: unknown }).step === "string" ? (e as { step: string }).step : null))
    .filter((s): s is string => s !== null);
}

function hasClientOrchestratorV1Step(instructionHistory: unknown): boolean {
  return instructionHistorySteps(instructionHistory).some((s) => s === "client_orchestrator_v1");
}

type DraftRow = {
  id: string;
  body: string;
  created_at: string;
  instruction_history: unknown;
};

async function pollForDraftEvidence(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  createdAfterIso: string,
): Promise<DraftRow | null> {
  const maxAttempts = settleMaxAttempts();
  const delayMs = settleDelayMs();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: drafts, error: dErr } = await supabase
      .from("drafts")
      .select("id, body, created_at, instruction_history")
      .eq("thread_id", threadId)
      .eq("photographer_id", photographerId)
      .gte("created_at", createdAfterIso)
      .order("created_at", { ascending: false })
      .limit(8);

    if (dErr) {
      console.warn("drafts poll:", dErr.message);
    } else if (drafts && drafts.length > 0) {
      const withOrch = drafts.find((d) => hasClientOrchestratorV1Step(d.instruction_history));
      if (withOrch) {
        return withOrch as DraftRow;
      }
    }
    await sleep(delayMs);
  }
  return null;
}

async function main(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const inngestKey = process.env.INNGEST_EVENT_KEY?.trim();
  const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");

  if (!url || !sr) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!inngestKey) {
    console.error("Missing INNGEST_EVENT_KEY (Inngest Cloud Event key for app atelier-os)");
    process.exit(1);
  }
  if (!existsSync(fixturesPath)) {
    console.error("Missing supabase/functions/inngest/.qa_fixtures.json");
    process.exit(1);
  }

  const fx = JSON.parse(readFileSync(fixturesPath, "utf8")) as { photographerId?: string };
  if (!fx.photographerId) {
    console.error(".qa_fixtures.json missing photographerId");
    process.exit(1);
  }
  const photographerId = fx.photographerId;

  const runBaseId = `ORCH-ING-${Date.now()}`;
  const proofRunId = `v3-orch-hosted-${runBaseId}`;

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });

  let seeded: Awaited<ReturnType<typeof seedInquiryWritingQaScenario>> | null = null;

  try {
    seeded = await seedInquiryWritingQaScenario(supabase, photographerId, "inquiry_warm_onboarding", runBaseId);
  } catch (e) {
    console.error("Seed failed:", e);
    process.exit(1);
  }

  const { weddingId, threadId, personIds, correlation, rawMessage } = seeded;

  const createdAfter = new Date(Date.now() - 60_000).toISOString();

  const eventPayload: Record<string, unknown> = {
    id: proofRunId,
    name: ORCHESTRATOR_EVENT,
    data: {
      schemaVersion: SCHEMA_VERSION,
      photographerId,
      weddingId,
      threadId,
      replyChannel: "email",
      rawMessage,
      requestedExecutionMode: "draft_only",
    },
  };

  const inngestUrl = `https://inn.gs/e/${encodeURIComponent(inngestKey)}`;
  const postRes = await fetch(inngestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventPayload),
  });

  const postText = await postRes.text();
  let inngestResponse: unknown;
  try {
    inngestResponse = JSON.parse(postText) as unknown;
  } catch {
    inngestResponse = postText;
  }

  if (!postRes.ok) {
    await cleanupInquiryWritingQaLoose(supabase, weddingId, threadId, personIds);
    throw new Error(`Inngest Event API failed: ${postRes.status} ${JSON.stringify(inngestResponse)}`);
  }

  const inngestEventIds =
    inngestResponse &&
    typeof inngestResponse === "object" &&
    inngestResponse !== null &&
    Array.isArray((inngestResponse as { ids?: unknown }).ids)
      ? ((inngestResponse as { ids: string[] }).ids as string[])
      : null;

  console.error(
    JSON.stringify({
      proof: "v3_orchestrator_client_v1_inngest_hosted",
      eventName: ORCHESTRATOR_EVENT,
      inngestHttpStatus: postRes.status,
      inngestEventIds,
      inngestDedupeId: proofRunId,
      scenario: "inquiry_warm_onboarding",
      correlationToken: correlation,
      weddingId,
      threadId,
    }),
  );

  const draftRow = await pollForDraftEvidence(supabase, photographerId, threadId, createdAfter);

  const steps = draftRow ? instructionHistorySteps(draftRow.instruction_history) : [];
  const hasOrchStep = draftRow ? hasClientOrchestratorV1Step(draftRow.instruction_history) : false;

  const workerEvidenceOk = Boolean(draftRow && hasOrchStep);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-orchestrator-client-v1-inngest-hosted-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);

  const report = {
    schema: "v3_orchestrator_client_v1_inngest_hosted_proof_v1",
    generatedAt: new Date().toISOString(),
    eventName: ORCHESTRATOR_EVENT,
    schemaVersion: SCHEMA_VERSION,
    scenario: {
      id: "inquiry_warm_onboarding" as const,
      seedCorrelation: correlation,
      note: "Single warm-inquiry thread; correlation appears in rawMessage and is used to match drafts when present.",
    },
    pathProven:
      "Inngest Event API → Inngest Cloud → Supabase Edge `inngest` serve → `clientOrchestratorV1Function` (see inngest/functions/clientOrchestratorV1.ts). This script does not import or call executeClientOrchestratorV1Core.",
    proofRunId,
    inngest: {
      urlHost: "inn.gs",
      httpStatus: postRes.status,
      responseBody: inngestResponse,
      eventIdsReturned: inngestEventIds,
      dedupeEventId: proofRunId,
    },
    identifiers: { photographerId, weddingId, threadId },
    observed: {
      draft: draftRow
        ? {
            id: draftRow.id,
            created_at: draftRow.created_at,
            instructionHistorySteps: steps,
            hasClientOrchestratorV1Step: hasOrchStep,
            bodyExcerpt: String(draftRow.body ?? "").slice(0, 800),
          }
        : null,
    },
    verdict: {
      inngestEventAccepted: postRes.ok,
      workerEvidenceOk,
      /** True when drafts row shows the orchestrator stub step from attemptOrchestratorDraft (proves handler ran past draft insert). */
      rationale: workerEvidenceOk
        ? "Draft row contains instruction_history step client_orchestrator_v1 — produced only after deployed clientOrchestratorV1 runs create-orchestrator-draft."
        : "No draft with client_orchestrator_v1 step within polling window — worker may have failed, verifier blocked draft, or cold start exceeded bounds.",
    },
    limitations: [
      "Does not prove triage-emitted events; uses direct Event API only.",
      "Does not assert persona/auditor chain; set ANTHROPIC_API_KEY on Supabase + deploy inngest for full prose (see v3:proof-rbac-inngest-hosted).",
      "Polling is bounded; tune V3_ORCH_INGEST_HOSTED_SETTLE_MAX_ATTEMPTS / V3_ORCH_INGEST_HOSTED_SETTLE_DELAY_MS if needed.",
    ],
    dashboard: {
      findEvent: `Event name: ${ORCHESTRATOR_EVENT}; optional idempotency id: ${proofRunId}`,
      findFunctionRun: "Function: Client Orchestrator V1 (email/web) — id client-orchestrator-v1",
    },
  };

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${jsonPath}`);
  console.log(JSON.stringify(report.verdict, null, 2));

  await cleanupInquiryWritingQaLoose(supabase, weddingId, threadId, personIds);

  if (!workerEvidenceOk) {
    console.error(
      "FAIL: No DB evidence of deployed clientOrchestratorV1 draft step. Check Inngest dashboard, deploy:inngest, and worker logs.",
    );
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
