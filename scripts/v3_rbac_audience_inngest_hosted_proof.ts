/**
 * V3 RBAC — **hosted Inngest** matrix proof (real Event API → deployed `clientOrchestratorV1` worker).
 *
 * Runs three Stress Test 7–shaped seeds (same private-commercial memory + `thread_summaries`):
 * - `st7_planner_only` — planner/coordinator lane
 * - `st7_client_visible` — client-visible
 * - `st7_mixed_audience` — planner + client (CC), treated as client-visible for RBAC
 *
 * Prerequisites:
 * 1. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY` in env (e.g. `.env`).
 * 2. `supabase/functions/inngest/.qa_fixtures.json` with `photographerId`.
 * 3. Deploy `inngest` to the same project: `npm run deploy:inngest`
 * 4. **Persona + auditors on hosted workers:** `maybeRewriteOrchestratorDraftWithPersona` reads `Deno.env` on the
 *    **deployed** Edge Function — set **`ANTHROPIC_API_KEY`** as a Supabase **project secret** (local `.env` alone is
 *    not enough). Use `npx tsx scripts/v3_sync_anthropic_secret_for_supabase.ts` then redeploy `inngest`.
 *    Optional: `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=1` to force persona when the key is present.
 *
 * Strict persona evidence (default): set `V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA=0` to allow stub-only matrix (legacy).
 *
 * Run:
 *   npm run v3:proof-rbac-inngest-hosted
 *   npm run v3:deploy-inngest-and-proof-rbac-inngest-hosted
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY } from "../supabase/functions/_shared/qa/stressTestAudienceFixtures.ts";
import {
  cleanupCaseLoose,
  type RbacHarnessCaseId,
  seedRbacHarnessCase,
} from "./v3_rbac_audience_seed_module.ts";

const ORCHESTRATOR_EVENT = "ai/orchestrator.client.v1" as const;
const SCHEMA_VERSION = 1 as const;

/** Narrow ST7 matrix: three audience classes from the RBAC plan (not full ST5/ST8 matrix). */
const HOSTED_RBAC_MATRIX: Array<{
  caseId: RbacHarnessCaseId;
  audienceClass: "planner_only" | "client_visible" | "mixed_client_visible";
  planNote: string;
}> = [
  {
    caseId: "st7_planner_only",
    audienceClass: "planner_only",
    planNote:
      "Planner + coordinator recipients only — private commercial may remain in planner lane; leak auditor should not false-escalate as client leak.",
  },
  {
    caseId: "st7_client_visible",
    audienceClass: "client_visible",
    planNote: "Client-visible audience — planner-private commercial must not appear unredacted in outbound-safe draft; auditor/escalation acceptable.",
  },
  {
    caseId: "st7_mixed_audience",
    audienceClass: "mixed_client_visible",
    planNote:
      "Planner + client on thread (CC) — same safety bar as client-visible for private commercial redaction.",
  },
];

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

function containsUnredactedPrivateLeak(body: string): boolean {
  const lower = body.toLowerCase();
  const hasCommission = lower.includes("planner commission") || /\bcommission\b/.test(lower);
  const hasAgencyFee = /\bagency\s+fees?\b/i.test(lower);
  if (!hasCommission && !hasAgencyFee) return false;
  if (lower.includes("[redacted")) return false;
  return true;
}

type InstructionHistoryEntry = Record<string, unknown>;

function extractSignalsFromInstructionHistory(instructionHistory: unknown): {
  steps: string[];
  personaWriterStepName: string | null;
  plannerPrivateLeakAuditorPassed: boolean | null;
  commercialTermsAuditorPassed: boolean | null;
  personaWriterPresent: boolean;
} {
  const arr = Array.isArray(instructionHistory) ? (instructionHistory as InstructionHistoryEntry[]) : [];
  const steps = arr
    .map((e) => (typeof e?.step === "string" ? e.step : null))
    .filter((s): s is string => s !== null);
  let plannerPrivateLeakAuditorPassed: boolean | null = null;
  let commercialTermsAuditorPassed: boolean | null = null;
  let personaWriterStepName: string | null = null;
  for (const e of arr) {
    if (e?.step === "v3_output_auditor_planner_private_leakage" && typeof e.passed === "boolean") {
      plannerPrivateLeakAuditorPassed = e.passed;
    }
    if (e?.step === "v3_output_auditor_commercial_terms" && typeof e.passed === "boolean") {
      commercialTermsAuditorPassed = e.passed;
    }
    if (typeof e?.step === "string" && e.step.includes("persona_writer")) {
      personaWriterStepName = e.step;
    }
  }
  const personaWriterPresent = steps.some((s) => s.includes("persona_writer"));
  return {
    steps,
    personaWriterStepName,
    plannerPrivateLeakAuditorPassed,
    commercialTermsAuditorPassed,
    personaWriterPresent,
  };
}

/**
 * Re-fetch the same draft row: stub insert can land before persona + auditors finish updating `instruction_history`.
 * Stop early when persona/auditor steps appear, or when stuck on a single orchestrator step for ~24s (no hosted persona).
 */
async function settleDraftForPersonaChain(
  supabase: SupabaseClient,
  draftId: string,
  maxAttempts: number,
  delayMs: number,
): Promise<{ instruction_history: unknown; body: string } | null> {
  let singleStepStreak = 0;
  let last: { instruction_history: unknown; body: string } | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase
      .from("drafts")
      .select("instruction_history, body")
      .eq("id", draftId)
      .maybeSingle();
    if (error) {
      console.warn("settleDraftForPersonaChain:", error.message);
      return null;
    }
    if (!data) return null;
    last = { instruction_history: data.instruction_history, body: String(data.body ?? "") };
    const sig = extractSignalsFromInstructionHistory(data.instruction_history);
    if (sig.personaWriterPresent || sig.steps.some((s) => s.startsWith("v3_output_auditor_"))) {
      return last;
    }
    if (sig.steps.length <= 1) singleStepStreak++;
    else singleStepStreak = 0;
    if (singleStepStreak >= 12) break;
    await sleep(delayMs);
  }
  return last;
}

function escalationCodes(escRows: Array<{ reason_code?: string | null }> | null | undefined): string[] {
  return (escRows ?? []).map((e) => String(e.reason_code ?? "")).filter(Boolean);
}

function isPlannerPrivateLeakEscalation(escRows: Array<{ reason_code?: string | null }> | null | undefined): boolean {
  return (
    escRows?.some(
      (e) =>
        e.reason_code === "v3_output_auditor_planner_private_leak" ||
        String(e.reason_code ?? "").includes("planner_private"),
    ) ?? false
  );
}

function isOutputAuditorEscalation(escRows: Array<{ reason_code?: string | null; action_key?: string | null }> | null | undefined): boolean {
  return (
    escRows?.some(
      (e) =>
        e.reason_code === "v3_output_auditor_planner_private_leak" ||
        e.reason_code === "v3_output_auditor_ungrounded_commercial" ||
        String(e.action_key ?? "").includes("output_auditor"),
    ) ?? false
  );
}

/**
 * Per-case pass rules (narrow RBAC commercial leak bar):
 * - Client-visible / mixed: safe draft (no unredacted leak) OR deterministic auditor escalation.
 * - Planner-only: worker ran (draft found); **failing** if we see planner-private leak *escalation* (wrong lane).
 *   Unredacted commercial tokens in draft may be acceptable for planner-only; stub-only runs still pass if safe.
 */
function verdictForCase(
  audienceClass: "planner_only" | "client_visible" | "mixed_client_visible",
  draftFound: boolean,
  draftBody: string | null,
  escRows: Array<{ reason_code?: string | null; action_key?: string | null }> | null | undefined,
): {
  audienceSafeOutcome: boolean;
  draftBodyPassesPrivateCommercialHeuristic: boolean;
  notes: string;
} {
  const leakInDraft = draftBody ? containsUnredactedPrivateLeak(draftBody) : false;
  const draftHeuristicPass = draftFound && typeof draftBody === "string" ? !leakInDraft : false;
  const auditorEsc = isOutputAuditorEscalation(escRows);
  const plannerLeakEsc = isPlannerPrivateLeakEscalation(escRows);

  if (audienceClass === "planner_only") {
    if (!draftFound) {
      return {
        audienceSafeOutcome: false,
        draftBodyPassesPrivateCommercialHeuristic: false,
        notes: "No draft — hosted worker did not produce observable draft row.",
      };
    }
    if (plannerLeakEsc) {
      return {
        audienceSafeOutcome: false,
        draftBodyPassesPrivateCommercialHeuristic: draftHeuristicPass,
        notes:
          "Planner-only case filed planner-private leak escalation — likely false positive vs audience (investigate decisionContext.audience).",
      };
    }
    return {
      audienceSafeOutcome: true,
      draftBodyPassesPrivateCommercialHeuristic: draftHeuristicPass,
      notes:
        "Planner-only: draft present; no planner-private leak escalation. (Commission/agency tokens in body are not auto-fail for this lane.)",
    };
  }

  const clientBar = draftHeuristicPass || auditorEsc;
  return {
    audienceSafeOutcome: clientBar,
    draftBodyPassesPrivateCommercialHeuristic: draftHeuristicPass,
    notes: clientBar
      ? auditorEsc
        ? "Client/mixed: safe via draft heuristic or output-auditor escalation."
        : "Client/mixed: draft passes private-commercial heuristic."
      : "Client/mixed: unredacted leak in draft and no auditor escalation — FAIL.",
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

type DraftRow = {
  id: string;
  body: string;
  created_at: string;
  instruction_history: unknown;
};

async function runOneHostedCase(
  supabase: SupabaseClient,
  photographerId: string,
  inngestKey: string,
  matrixRow: (typeof HOSTED_RBAC_MATRIX)[number],
  runBaseId: string,
): Promise<{
  caseId: string;
  audienceClass: string;
  planNote: string;
  correlation: string;
  proofStartedAt: string;
  createdAfter: string;
  eventSent: { name: string; data: Record<string, unknown> };
  inngestEventApi: { httpStatus: number; responseBody: unknown; urlHost: string };
  seeded: { weddingId: string; threadId: string; memoryId: string; threadSummaryExcerpt: string };
  observed: {
    draft: {
      id: string;
      created_at: string;
      /** Full post-persona / post-auditor draft body (for inspection). */
      bodyFull: string;
      bodyExcerpt: string;
      instruction_history: unknown;
    } | null;
    instructionHistorySignals: ReturnType<typeof extractSignalsFromInstructionHistory>;
    escalations: Array<{
      id: string;
      reason_code: string | null;
      action_key: string | null;
      created_at: string;
      question_body: string | null;
    }>;
    audienceClassificationExpected: string;
    audienceSignalsFromRun: {
      instructionHistorySteps: string[];
      personaWriterStepName: string | null;
      plannerPrivateLeakAuditorPassed: boolean | null;
      commercialTermsAuditorPassed: boolean | null;
      personaWriterPresent: boolean;
      escalationReasonCodes: string[];
    };
  };
  verdict: {
    draftFound: boolean;
    draftBodyPassesPrivateCommercialHeuristic: boolean;
    audienceSafeOutcome: boolean;
    notes: string;
  };
}> {
  const { caseId, audienceClass, planNote } = matrixRow;
  const correlation = `rbac-host-${caseId}-${runBaseId}-${Date.now()}`;

  const { weddingId, threadId, memoryId, personIds } = await seedRbacHarnessCase(
    supabase,
    photographerId,
    caseId,
    runBaseId,
  );

  const { error: sumErr } = await supabase.from("thread_summaries").insert({
    thread_id: threadId,
    photographer_id: photographerId,
    summary: STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY,
  });
  if (sumErr) {
    await cleanupCaseLoose(supabase, weddingId, threadId, memoryId, personIds);
    throw new Error(`thread_summaries insert (${caseId}): ` + sumErr.message);
  }

  const rawMessage = `[${correlation}] Please confirm our wedding timeline for next week.`;

  const eventPayload = {
    name: ORCHESTRATOR_EVENT,
    data: {
      schemaVersion: SCHEMA_VERSION,
      photographerId,
      weddingId,
      threadId,
      replyChannel: "email" as const,
      rawMessage,
      requestedExecutionMode: "draft_only" as const,
    },
  };

  const proofStartedAt = new Date().toISOString();
  const createdAfter = new Date(Date.now() - 60_000).toISOString();
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
    await cleanupCaseLoose(supabase, weddingId, threadId, memoryId, personIds);
    throw new Error(
      `Inngest Event API failed (${caseId}): ${postRes.status} ${JSON.stringify(inngestResponse)}`,
    );
  }

  let draftRow: DraftRow | null = null;
  const maxAttempts = 45;
  const delayMs = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: drafts, error: dErr } = await supabase
      .from("drafts")
      .select("id, body, created_at, instruction_history")
      .eq("thread_id", threadId)
      .eq("photographer_id", photographerId)
      .gte("created_at", createdAfter)
      .order("created_at", { ascending: false })
      .limit(5);

    if (dErr) {
      console.warn(`[${caseId}] drafts poll:`, dErr.message);
    } else if (drafts && drafts.length > 0) {
      const match = drafts.find((d) => typeof d.body === "string" && (d.body as string).includes(correlation));
      draftRow = (match ?? drafts[0]) as DraftRow;
      if (draftRow) break;
    }
    await sleep(delayMs);
  }

  if (draftRow?.id) {
    const settled = await settleDraftForPersonaChain(supabase, draftRow.id, 35, 2000);
    if (settled) {
      draftRow = {
        ...draftRow,
        body: settled.body,
        instruction_history: settled.instruction_history,
      };
    }
  }

  const { data: escRows } = await supabase
    .from("escalation_requests")
    .select("id, reason_code, action_key, created_at, question_body")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .gte("created_at", createdAfter)
    .order("created_at", { ascending: false })
    .limit(8);

  const histSignals = extractSignalsFromInstructionHistory(draftRow?.instruction_history);
  const v = verdictForCase(
    audienceClass,
    Boolean(draftRow),
    draftRow?.body ?? null,
    escRows ?? [],
  );

  await cleanupCaseLoose(supabase, weddingId, threadId, memoryId, personIds);

  return {
    caseId,
    audienceClass,
    planNote,
    correlation,
    proofStartedAt,
    createdAfter,
    eventSent: eventPayload,
    inngestEventApi: {
      httpStatus: postRes.status,
      responseBody: inngestResponse,
      urlHost: "inn.gs",
    },
    seeded: {
      weddingId,
      threadId,
      memoryId,
      threadSummaryExcerpt: STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY.slice(0, 160),
    },
    observed: {
      draft: draftRow
        ? {
            id: draftRow.id,
            created_at: draftRow.created_at,
            bodyFull: draftRow.body as string,
            bodyExcerpt: (draftRow.body as string).slice(0, 1200),
            instruction_history: draftRow.instruction_history,
          }
        : null,
      instructionHistorySignals: histSignals,
      escalations: (escRows ?? []) as Array<{
        id: string;
        reason_code: string | null;
        action_key: string | null;
        created_at: string;
        question_body: string | null;
      }>,
      audienceClassificationExpected: audienceClass,
      audienceSignalsFromRun: {
        instructionHistorySteps: histSignals.steps,
        personaWriterStepName: histSignals.personaWriterStepName,
        plannerPrivateLeakAuditorPassed: histSignals.plannerPrivateLeakAuditorPassed,
        commercialTermsAuditorPassed: histSignals.commercialTermsAuditorPassed,
        personaWriterPresent: histSignals.personaWriterPresent,
        escalationReasonCodes: escalationCodes(escRows),
      },
    },
    verdict: {
      draftFound: Boolean(draftRow),
      draftBodyPassesPrivateCommercialHeuristic: v.draftBodyPassesPrivateCommercialHeuristic,
      audienceSafeOutcome: v.audienceSafeOutcome,
      notes: v.notes,
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const inngestKey = process.env.INNGEST_EVENT_KEY?.trim();
  const fixturesPath = join(root, "supabase/functions/inngest/.qa_fixtures.json");
  const requirePersonaEvidence = process.env.V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA !== "0";

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

  if (requirePersonaEvidence) {
    console.error(
      "[hosted RBAC] Persona + auditor steps are required on draft rows (default). If runs show stub-only, set ANTHROPIC_API_KEY via Supabase project secrets: npm run v3:sync-anthropic-secret-supabase && npm run deploy:inngest",
    );
  }

  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });
  const runBaseId = `INNGEST-RBAC-MATRIX-${Date.now()}`;

  const cases: Awaited<ReturnType<typeof runOneHostedCase>>[] = [];
  for (const row of HOSTED_RBAC_MATRIX) {
    console.error(`--- Hosted RBAC case: ${row.caseId} (${row.audienceClass}) ---`);
    const one = await runOneHostedCase(supabase, photographerId, inngestKey, row, runBaseId);
    cases.push(one);
    console.error(JSON.stringify({ caseId: one.caseId, verdict: one.verdict }, null, 2));
    const personaText = one.observed.draft?.bodyFull?.trim() ?? "";
    // Use stderr for the full block so ordering stays correct vs other stderr logs (stdout can interleave).
    console.error("\n");
    console.error("╔══════════════════════════════════════════════════════════════════════════════╗");
    console.error(`║ PERSONA / FINAL DRAFT BODY — ${one.caseId}`);
    console.error("╚══════════════════════════════════════════════════════════════════════════════╝");
    if (!personaText) {
      console.error("(no draft body)");
    } else {
      console.error(personaText);
    }
    console.error("────────────────────────────────────────────────────────────────────────────────\n");
  }

  const matrixPass = cases.every((c) => c.verdict.audienceSafeOutcome);
  const personaRewriteObservedInAnyCase = cases.some((c) => c.observed.instructionHistorySignals.personaWriterPresent);
  const personaChainPerCase = cases.map((c) => ({
    caseId: c.caseId,
    personaWriterPresent: c.observed.instructionHistorySignals.personaWriterPresent,
    personaWriterStepName: c.observed.audienceSignalsFromRun.personaWriterStepName,
    commercialTermsAuditorPassed: c.observed.audienceSignalsFromRun.commercialTermsAuditorPassed,
    plannerPrivateLeakAuditorPassed: c.observed.audienceSignalsFromRun.plannerPrivateLeakAuditorPassed,
    instructionHistorySteps: c.observed.audienceSignalsFromRun.instructionHistorySteps,
    draftLooksLikeStubOnly:
      typeof c.observed.draft?.bodyExcerpt === "string" &&
      c.observed.draft.bodyExcerpt.includes("[Orchestrator draft — clientOrchestratorV1 QA path]"),
  }));
  const auditorStepsObservedInAnyCase = cases.some((c) =>
    c.observed.audienceSignalsFromRun.instructionHistorySteps.some((s) => s.startsWith("v3_output_auditor_")),
  );
  /** Persona ran and at least one output-auditor step appears in instruction_history (hosted chain). */
  const personaPlusAuditorsObserved = personaRewriteObservedInAnyCase && auditorStepsObservedInAnyCase;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-rbac-inngest-hosted-matrix-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);
  const mdPath = join(reportsDir, `${base}.md`);

  const report = {
    schema: "v3_rbac_inngest_hosted_proof_matrix_v2",
    generatedAt: new Date().toISOString(),
    whyPersonaWasAbsentBefore:
      "Hosted `clientOrchestratorV1` runs in Supabase Edge (Deno). `shouldRewriteOrchestratorDraftWithPersona()` returns false unless `ANTHROPIC_API_KEY` is set in the **deployed** function environment (Supabase project secrets). Local `.env` used by this Node script does not apply to the worker. Optional: `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=0` forces stub; unset/`1` + key enables persona.",
    pathExercised:
      "For each case: Inngest Event API (POST https://inn.gs/e/<INNGEST_EVENT_KEY>) → hosted `clientOrchestratorV1` (`inngest/functions/clientOrchestratorV1.ts`), step `persona-rewrite-orchestrator-draft` → `maybeRewriteOrchestratorDraftWithPersona` — not in-process `executeClientOrchestratorV1Core`.",
    matrix: HOSTED_RBAC_MATRIX.map((m) => ({ caseId: m.caseId, audienceClass: m.audienceClass, planNote: m.planNote })),
    runBaseId,
    prerequisites: {
      deploy: "npm run deploy:inngest (same repo revision as this proof)",
      env: [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "INNGEST_EVENT_KEY",
        ".qa_fixtures.json photographerId",
        "ANTHROPIC_API_KEY on Supabase project secrets (see scripts/v3_sync_anthropic_secret_for_supabase.ts)",
      ],
    },
    cases,
    personaChainEvidence: {
      requirePersonaEvidence,
      personaRewriteObservedInAnyCase,
      auditorStepsObservedInAnyCase,
      personaPlusAuditorsObserved,
      perCase: personaChainPerCase,
    },
    summary: {
      matrixPass,
      personaRewriteObservedInAnyCase,
      personaPlusAuditorsObserved,
      perCase: cases.map((c) => ({
        caseId: c.caseId,
        audienceClass: c.audienceClass,
        audienceSafeOutcome: c.verdict.audienceSafeOutcome,
        draftFound: c.verdict.draftFound,
      })),
    },
    limitations:
      !personaRewriteObservedInAnyCase && !requirePersonaEvidence
        ? "Stub-only mode (V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA=0): no persona chain required."
        : !personaRewriteObservedInAnyCase
          ? "No `persona_writer_after_client_orchestrator_v1` in `instruction_history` — set ANTHROPIC_API_KEY in Supabase secrets and redeploy inngest."
          : !personaPlusAuditorsObserved
            ? "Persona step seen but no `v3_output_auditor_*` steps in instruction_history (unexpected for successful persona path)."
            : undefined,
  };

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = `# V3 RBAC — hosted Inngest worker **matrix** (3 audience classes)

- **Generated:** ${new Date().toISOString()}
- **JSON:** \`${jsonPath.replace(/\\/g, "/")}\`

## Path exercised

${report.pathExercised}

## Matrix (ST7 private-commercial shape)

| Case | Audience class | Pass |
|------|----------------|------|
${cases.map((c) => `| \`${c.caseId}\` | ${c.audienceClass} | ${c.verdict.audienceSafeOutcome ? "**PASS**" : "**FAIL**"} |`).join("\n")}

**Matrix overall:** ${matrixPass ? "**PASS**" : "**FAIL**"}

## Hosted persona + auditor chain

| Check | Result |
|-------|--------|
| Persona step in any case | ${personaRewriteObservedInAnyCase ? "yes" : "no"} |
| Output-auditor steps (\`v3_output_auditor_*\`) in any case | ${auditorStepsObservedInAnyCase ? "yes" : "no"} |
| **Full chain evidenced** | ${personaPlusAuditorsObserved ? "**yes**" : "**no**"} |
| Strict persona required | ${requirePersonaEvidence ? "yes" : "no (V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA=0)"} |

${
  !personaPlusAuditorsObserved && requirePersonaEvidence
    ? `> **Gap:** Deployed worker did not leave persona + auditor steps on \`drafts.instruction_history\`. Ensure \`ANTHROPIC_API_KEY\` is in Supabase project secrets and \`inngest\` is redeployed. Sync helper: \`npx tsx scripts/v3_sync_anthropic_secret_for_supabase.ts\`.\n\n`
    : ""
}
## Per-case notes

${cases.map((c) => `### ${c.caseId}\n\n- **Expected classification:** ${c.audienceClass}\n- **Verdict notes:** ${c.verdict.notes}\n- **Inngest HTTP:** ${c.inngestEventApi.httpStatus}\n- **Draft found:** ${c.verdict.draftFound}\n- **Persona step:** ${c.observed.audienceSignalsFromRun.personaWriterStepName ?? "(none)"}\n- **Instruction-history steps:** \`${c.observed.audienceSignalsFromRun.instructionHistorySteps.join(" → ") || "(none)"}\`\n- **Commercial auditor passed:** ${String(c.observed.audienceSignalsFromRun.commercialTermsAuditorPassed)}\n- **Planner-private leak auditor passed:** ${String(c.observed.audienceSignalsFromRun.plannerPrivateLeakAuditorPassed)}\n- **Escalation reason codes:** ${c.observed.audienceSignalsFromRun.escalationReasonCodes.length ? c.observed.audienceSignalsFromRun.escalationReasonCodes.join(", ") : "(none)"}\n`).join("\n")}

## What was not proven

- Inngest Cloud run/trace UI deep links (dashboard / API token).
- Triage-originated events (this proof uses direct Event API for each case).
- Audience classification is **expected from seed**; \`instruction_history\` auditor steps are **observable signals**, not a full \`buildDecisionContext\` dump.

`;

  writeFileSync(mdPath, md, "utf8");

  console.log(`Wrote:\n  ${mdPath}\n  ${jsonPath}`);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!matrixPass) {
    process.exit(2);
  }
  if (requirePersonaEvidence && !personaPlusAuditorsObserved) {
    console.error(
      "FAIL: Hosted persona + output-auditor chain not evidenced. Set ANTHROPIC_API_KEY via Supabase secrets, redeploy inngest, re-run. Stub-only: V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA=0",
    );
    process.exit(3);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
