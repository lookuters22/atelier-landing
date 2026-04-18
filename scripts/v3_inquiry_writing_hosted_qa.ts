/**
 * Hosted Inngest **inquiry writing QA** — real `ai/orchestrator.client.v1` → `clientOrchestratorV1` → persona draft.
 *
 * Seeds 4 client-visible inquiry scenarios, sends Event API events, prints full draft bodies, writes `reports/`.
 *
 * Prerequisites: same as RBAC hosted proof (`SUPABASE_*`, `INNGEST_EVENT_KEY`, `.qa_fixtures.json`, deploy `inngest`, `ANTHROPIC_API_KEY` on project secrets for persona prose).
 *
 * Default: **does not delete** seeded rows (inspect in DB). Set `V3_INQUIRY_QA_HOSTED_CLEANUP=1` to best-effort delete after the report.
 *
 * Run: `npm run v3:proof-inquiry-writing-hosted`
 *
 * Settle tuning (optional): `V3_INQUIRY_QA_HOSTED_SETTLE_MAX_ATTEMPTS` (default 55), `V3_INQUIRY_QA_HOSTED_SETTLE_DELAY_MS` (default 2000).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  cleanupInquiryWritingQaLoose,
  ensureInquiryWritingQaPlaybookMinimums,
  type InquiryWritingQaScenarioId,
  seedInquiryWritingQaScenario,
} from "./v3_inquiry_writing_qa_seed.ts";
import {
  classifyInquiryWritingQaDraft,
  summarizeInstructionHistory,
  type ClassifyInquiryWritingQaDraftResult,
} from "../src/lib/inquiryWritingHostedQaClassification.ts";
import type { DecisionContext, PlaybookRuleContextRow } from "../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../src/types/crmSnapshot.types.ts";
import type { InquiryReplyPlan } from "../src/types/inquiryReplyPlan.types.ts";
import { deriveInquiryReplyPlan } from "../supabase/functions/_shared/orchestrator/deriveInquiryReplyPlan.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "../supabase/functions/_shared/context/fetchActivePlaybookRulesForDecisionContext.ts";
import {
  type BudgetStatementInjectionPlan,
  planBudgetStatementInjection,
} from "../supabase/functions/_shared/orchestrator/budgetStatementInjection.ts";

/** Machine-readable pricing path for the inbound + playbook snapshot (hosted report visibility). */
export type BudgetTurnOutcome = "inject" | "blocked_missing_pricing" | "not_budget_turn";

export function budgetTurnOutcomeFromPlan(plan: BudgetStatementInjectionPlan): BudgetTurnOutcome {
  if (plan.mode === "none") return "not_budget_turn";
  if (plan.mode === "inject") return "inject";
  return "blocked_missing_pricing";
}

const ORCHESTRATOR_EVENT = "ai/orchestrator.client.v1" as const;
const SCHEMA_VERSION = 1 as const;

const SCENARIOS: InquiryWritingQaScenarioId[] = [
  "inquiry_warm_onboarding",
  "inquiry_date_location_clarify",
  "inquiry_availability_timeline",
  "inquiry_budget_sensitive",
];

/** Separates availability/calendar grounding from pure Ana tone review in reports. */
const SCENARIO_REVIEW_LENS: Record<
  InquiryWritingQaScenarioId,
  "ana_voice_sample" | "availability_calendar_and_booking_policy"
> = {
  inquiry_warm_onboarding: "ana_voice_sample",
  inquiry_date_location_clarify: "ana_voice_sample",
  inquiry_availability_timeline: "availability_calendar_and_booking_policy",
  inquiry_budget_sensitive: "ana_voice_sample",
};

const REVIEW_LENS_GUIDANCE: Record<
  "ana_voice_sample" | "availability_calendar_and_booking_policy",
  string
> = {
  ana_voice_sample:
    "When finalState is persona_final, treat the draft as a candidate for Ana tone/warmth review (still check grounded policy separately for budget-sensitive content).",
  availability_calendar_and_booking_policy:
    "Do not treat odd phrasing as an Ana tone regression by default — first check whether availability, dates, and booking next-steps are grounded in CRM/playbook and commercially safe.",
};

function settleMaxAttempts(): number {
  const raw = process.env.V3_INQUIRY_QA_HOSTED_SETTLE_MAX_ATTEMPTS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 55;
}

function settleDelayMs(): number {
  const raw = process.env.V3_INQUIRY_QA_HOSTED_SETTLE_DELAY_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 200) return n;
  return 2000;
}

/** Matches seeded inquiry weddings; used only to derive a demo reply-plan (playbook not loaded in this script). */
function hostedQaInquiryDecisionContext(): DecisionContext {
  return { crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" } } as DecisionContext;
}

function displayClassificationNotes(
  c: ClassifyInquiryWritingQaDraftResult,
  lens: (typeof SCENARIO_REVIEW_LENS)[InquiryWritingQaScenarioId],
): string {
  if (c.finalState === "persona_final" && lens === "availability_calendar_and_booking_policy") {
    return (
      "Instruction history shows persona_writer_after_client_orchestrator_v1 with no failed v3_output_auditor step. " +
      "For this scenario, treat grounded availability / booking-process claims as the primary review axis — Ana tone is secondary."
    );
  }
  return c.classificationNotes;
}

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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll until `instruction_history` records `persona_writer` (persona + auditors finished in one Inngest step)
 * or the budget is exhausted.
 *
 * **Important:** Do not stop early while only `client_orchestrator_v1` is present — persona may still be running
 * on the worker; the old single-step streak exit caused transient stub captures.
 */
async function settleDraftUntilPersonaOrTimeout(
  supabase: SupabaseClient,
  draftId: string,
  maxAttempts: number,
  delayMs: number,
): Promise<{ instruction_history: unknown; body: string; timedOut: boolean } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase
      .from("drafts")
      .select("instruction_history, body")
      .eq("id", draftId)
      .maybeSingle();
    if (error) {
      console.warn("settleDraftUntilPersonaOrTimeout:", error.message);
      return null;
    }
    if (!data) return null;
    const last = { instruction_history: data.instruction_history, body: String(data.body ?? "") };
    const { orchestratorDraftRewriteSettled } = summarizeInstructionHistory(data.instruction_history);
    if (orchestratorDraftRewriteSettled) {
      return { ...last, timedOut: false };
    }
    await sleep(delayMs);
  }
  const { data: final, error: finalErr } = await supabase
    .from("drafts")
    .select("instruction_history, body")
    .eq("id", draftId)
    .maybeSingle();
  if (finalErr) {
    console.warn("settleDraftUntilPersonaOrTimeout (final fetch):", finalErr.message);
    return null;
  }
  if (!final) return null;
  return {
    instruction_history: final.instruction_history,
    body: String(final.body ?? ""),
    timedOut: true,
  };
}

type EscalationSummary = { id: string; created_at: string; reason_code: string; action_key: string };

async function fetchEscalationsForThreadAfter(
  supabase: SupabaseClient,
  threadId: string,
  createdAfterIso: string,
): Promise<EscalationSummary[]> {
  const { data, error } = await supabase
    .from("escalation_requests")
    .select("id, created_at, reason_code, action_key")
    .eq("thread_id", threadId)
    .gte("created_at", createdAfterIso)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("fetchEscalationsForThreadAfter:", error.message);
    return [];
  }
  return (data ?? []) as EscalationSummary[];
}

type DraftRow = { id: string; body: string; created_at: string; instruction_history: unknown };

/** Cheap automation — human judgment still required for “Ana voice”. */
function heuristicToneVerdict(body: string): { verdict: string; notes: string } {
  const t = body.trim();
  if (t.length < 40) {
    return { verdict: "too_short_or_empty", notes: "Draft unexpectedly short." };
  }
  const pendingStub =
    "Reply draft pending — generated text will replace this when the writer runs successfully.";
  if (
    (t.includes(pendingStub) || /^\[Orchestrator draft — clientOrchestratorV1 QA path\]/m.test(t)) &&
    t.length < 500
  ) {
    return { verdict: "likely_stub_only", notes: "Orchestrator pending placeholder or legacy stub — little follow-on prose." };
  }
  if (/\[Studio Name\]|\[studio name\]/i.test(t)) {
    return {
      verdict: "placeholder_studio_tokens",
      notes: "Unresolved studio placeholder — still common in persona output; judge readability manually.",
    };
  }
  if (/my name is ana/i.test(t) || /\bAna\b/.test(t)) {
    return {
      verdict: "good_ana_voice_candidate",
      notes: "Ana sign-off or introduction pattern present; read full body for generic vs warm.",
    };
  }
  return {
    verdict: "inspect_manually",
    notes: "Full-length draft; automation does not score warmth vs generic — read body below.",
  };
}

async function seedWithRetry(
  supabase: SupabaseClient,
  photographerId: string,
  scenarioId: InquiryWritingQaScenarioId,
  runId: string,
): Promise<Awaited<ReturnType<typeof seedInquiryWritingQaScenario>>> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await seedInquiryWritingQaScenario(supabase, photographerId, scenarioId, runId);
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        console.warn(`[${scenarioId}] seed retry ${attempt + 1}/3 after:`, last.message);
        await sleep(2500);
      }
    }
  }
  throw last ?? new Error("seed failed");
}

async function runOneScenario(
  supabase: SupabaseClient,
  photographerId: string,
  inngestKey: string,
  scenarioId: InquiryWritingQaScenarioId,
  runId: string,
): Promise<{
  scenarioId: InquiryWritingQaScenarioId;
  scenarioLabel: string;
  reviewLens: (typeof SCENARIO_REVIEW_LENS)[InquiryWritingQaScenarioId];
  correlation: string;
  seeded: { weddingId: string; threadId: string };
  eventSent: { name: string; data: Record<string, unknown> };
  inngestEventIds: string[] | null;
  primaryEventId: string | null;
  draft: { id: string; created_at: string; bodyFull: string; instruction_history: unknown } | null;
  settleTimedOut: boolean;
  classification: ClassifyInquiryWritingQaDraftResult;
  classificationNotesDisplay: string;
  escalationsAfterSeed: EscalationSummary[];
  tone: ReturnType<typeof heuristicToneVerdict>;
  voiceSampleForAnaToneReview: boolean;
  reviewLensGuidance: string;
  derivedInquiryReplyPlan: InquiryReplyPlan | null;
  budgetStatementInjectionPlan: BudgetStatementInjectionPlan;
  /** Derived from `budgetStatementInjectionPlan` for reporting. */
  budgetTurnOutcome: BudgetTurnOutcome;
  playbookRulesLoaded: number;
}> {
  const seed = await seedWithRetry(supabase, photographerId, scenarioId, runId);
  const { weddingId, threadId, personIds, rawMessage, correlation, scenarioLabel } = seed;

  let playbookRules: PlaybookRuleContextRow[] = [];
  try {
    playbookRules = await fetchActivePlaybookRulesForDecisionContext(supabase, photographerId);
  } catch (e) {
    console.warn(
      `[${scenarioId}] fetchActivePlaybookRulesForDecisionContext:`,
      e instanceof Error ? e.message : e,
    );
  }

  const budgetStatementInjectionPlan = planBudgetStatementInjection(rawMessage, playbookRules);
  const budgetTurnOutcome = budgetTurnOutcomeFromPlan(budgetStatementInjectionPlan);
  if (scenarioId === "inquiry_budget_sensitive" && budgetTurnOutcome === "blocked_missing_pricing") {
    console.warn(
      `[${scenarioId}] Budget-fit inbound but no verified minimum-investment paragraph from playbook — worker will use MISSING_PRICING_DATA guardrail (persona skipped).`,
    );
  }
  const derivedInquiryReplyPlan = deriveInquiryReplyPlan({
    decisionContext: hostedQaInquiryDecisionContext(),
    rawMessage,
    playbookRules,
    budgetPlan: budgetStatementInjectionPlan,
  });

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

  const createdAfter = new Date(Date.now() - 60_000).toISOString();
  const inngestUrl = `https://inn.gs/e/${encodeURIComponent(inngestKey)}`;

  const postRes = await fetch(inngestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventPayload),
  });

  const postText = await postRes.text();
  let inngestParsed: { ids?: string[] } | null = null;
  try {
    inngestParsed = JSON.parse(postText) as { ids?: string[] };
  } catch {
    inngestParsed = null;
  }

  if (!postRes.ok) {
    if (process.env.V3_INQUIRY_QA_HOSTED_CLEANUP === "1") {
      await cleanupInquiryWritingQaLoose(supabase, weddingId, threadId, personIds);
    }
    throw new Error(`Inngest failed (${scenarioId}): ${postRes.status} ${postText}`);
  }

  const inngestEventIds = Array.isArray(inngestParsed?.ids) ? inngestParsed!.ids : null;

  let draftRow: DraftRow | null = null;
  for (let attempt = 0; attempt < 45; attempt++) {
    const { data: drafts, error: dErr } = await supabase
      .from("drafts")
      .select("id, body, created_at, instruction_history")
      .eq("thread_id", threadId)
      .eq("photographer_id", photographerId)
      .gte("created_at", createdAfter)
      .order("created_at", { ascending: false })
      .limit(5);

    if (dErr) console.warn(`[${scenarioId}] drafts:`, dErr.message);
    else if (drafts?.length) {
      const match = drafts.find((d) => typeof d.body === "string" && (d.body as string).includes(correlation));
      draftRow = (match ?? drafts[0]) as DraftRow;
      if (draftRow) break;
    }
    await sleep(2000);
  }

  let settleTimedOut = false;
  if (draftRow?.id) {
    const settled = await settleDraftUntilPersonaOrTimeout(
      supabase,
      draftRow.id,
      settleMaxAttempts(),
      settleDelayMs(),
    );
    if (settled) {
      draftRow = { ...draftRow, body: settled.body, instruction_history: settled.instruction_history };
      settleTimedOut = settled.timedOut;
    }
  }

  const bodyFull = draftRow?.body?.trim() ?? "";
  const tone = heuristicToneVerdict(bodyFull);

  const classification = classifyInquiryWritingQaDraft({
    draftFound: Boolean(draftRow?.id),
    body: bodyFull,
    instructionHistory: draftRow?.instruction_history,
    settleTimedOut,
  });

  const escalationsAfterSeed =
    draftRow?.id ? await fetchEscalationsForThreadAfter(supabase, threadId, createdAfter) : [];

  const lens = SCENARIO_REVIEW_LENS[scenarioId];
  const classificationNotesDisplay = displayClassificationNotes(classification, lens);
  const voiceSampleForAnaToneReview =
    classification.finalState === "persona_final" && lens === "ana_voice_sample";

  if (process.env.V3_INQUIRY_QA_HOSTED_CLEANUP === "1") {
    await cleanupInquiryWritingQaLoose(supabase, weddingId, threadId, personIds);
  }

  return {
    scenarioId,
    scenarioLabel,
    reviewLens: lens,
    reviewLensGuidance: REVIEW_LENS_GUIDANCE[lens],
    correlation,
    seeded: { weddingId, threadId },
    eventSent: eventPayload,
    inngestEventIds,
    primaryEventId: inngestEventIds?.[0] ?? null,
    draft: draftRow
      ? {
          id: draftRow.id,
          created_at: draftRow.created_at,
          bodyFull,
          instruction_history: draftRow.instruction_history,
        }
      : null,
    settleTimedOut,
    classification,
    classificationNotesDisplay,
    escalationsAfterSeed,
    tone,
    voiceSampleForAnaToneReview,
    derivedInquiryReplyPlan,
    budgetStatementInjectionPlan,
    budgetTurnOutcome,
    playbookRulesLoaded: playbookRules.length,
  };
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
    console.error("Missing INNGEST_EVENT_KEY");
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

  const runId = `INQUIRY-QA-${Date.now()}`;
  const supabase = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });

  await ensureInquiryWritingQaPlaybookMinimums(supabase, fx.photographerId);

  console.error(
    `[inquiry-writing QA] runId=${runId} | cleanup=${process.env.V3_INQUIRY_QA_HOSTED_CLEANUP === "1" ? "on" : "off (default — rows kept for DB inspection)"}`,
  );

  const results: Awaited<ReturnType<typeof runOneScenario>>[] = [];
  const errors: Array<{ scenarioId: string; message: string }> = [];
  for (const sid of SCENARIOS) {
    console.error(`\n--- Scenario: ${sid} ---\n`);
    try {
      const one = await runOneScenario(supabase, fx.photographerId, inngestKey, sid, runId);
      results.push(one);

      const body = one.draft?.bodyFull ?? "(no draft)";
      console.error("\n");
      console.error("╔══════════════════════════════════════════════════════════════════════════════╗");
      console.error(`║ FINAL DRAFT — ${sid}`);
      console.error("╚══════════════════════════════════════════════════════════════════════════════╝");
      console.error(body);
      console.error("────────────────────────────────────────────────────────────────────────────────\n");
      console.error(
        JSON.stringify(
          {
            scenarioId: sid,
            reviewLens: one.reviewLens,
            finalState: one.classification.finalState,
            voiceSampleForAnaToneReview: one.voiceSampleForAnaToneReview,
            primaryEventId: one.primaryEventId,
            inngestEventIds: one.inngestEventIds,
            draftId: one.draft?.id ?? null,
            settleTimedOut: one.settleTimedOut,
            toneVerdict: one.tone.verdict,
            toneNotes: one.tone.notes,
            classificationNotes: one.classificationNotesDisplay,
            derivedInquiryReplyPlan: one.derivedInquiryReplyPlan,
            budgetStatementInjectionPlan: one.budgetStatementInjectionPlan,
            budgetTurnOutcome: one.budgetTurnOutcome,
            playbookRulesLoaded: one.playbookRulesLoaded,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ scenarioId: sid, message });
      console.error(`[ERROR] ${sid}: ${message}`);
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = `v3-inquiry-writing-hosted-qa-${ts}`;
  const jsonPath = join(reportsDir, `${base}.json`);
  const mdPath = join(reportsDir, `${base}.md`);

  const authorAssessment =
    "Hosted outputs vary by model and week; the style-anchor prompt helps but automation here only flags stubs/placeholders. " +
    "Read each body for warmth vs generic templating — Ana sign-offs and boundary-setting in the few-shot block should appear more often after the voice slice, but judge manually.";

  const report = {
    schema: "v3_inquiry_writing_hosted_qa_v3",
    generatedAt: new Date().toISOString(),
    runId,
    budgetPlaybookFixture:
      "Replaced/inserted active playbook_rules with source_type v3_qa_inquiry_writing_budget_minimum (local $10,000 + destination $15,000) for the QA photographer before scenarios — enables deterministic budget injection when inbound matches planBudgetStatementInjection.",
    settleConfig: {
      maxAttempts: settleMaxAttempts(),
      delayMs: settleDelayMs(),
      envOverrides: "V3_INQUIRY_QA_HOSTED_SETTLE_MAX_ATTEMPTS, V3_INQUIRY_QA_HOSTED_SETTLE_DELAY_MS",
    },
    pathExercised:
      "Inngest Event API → hosted `clientOrchestratorV1` (`inngest/functions/clientOrchestratorV1.ts`), email `draft_only`, persona rewrite when `ANTHROPIC_API_KEY` is set on the worker.",
    cleanupNote:
      process.env.V3_INQUIRY_QA_HOSTED_CLEANUP === "1"
        ? "Cleanup ran after each scenario (best-effort)."
        : "Seeded weddings/threads/drafts left in project for manual inspection. Set V3_INQUIRY_QA_HOSTED_CLEANUP=1 to delete after review.",
    errors: errors.length > 0 ? errors : undefined,
    authorAssessment,
    classificationLegend:
      "finalState: persona_final = post-audit persona body; stub_fallback = orchestrator A2 stub or persona never logged; auditor_rejected = V3 output auditor failed and stub restored; runtime_failure = no draft row.",
    derivedInquiryReplyPlanNote:
      "Per-scenario `derivedInquiryReplyPlan` and `budgetStatementInjectionPlan` use `fetchActivePlaybookRulesForDecisionContext` after `ensureInquiryWritingQaPlaybookMinimums` seeds QA minimum rows for the fixture photographer. `budgetTurnOutcome`: `inject` = deterministic minimum injection; `blocked_missing_pricing` = budget-fit question but no verified playbook minimum (MISSING_PRICING_DATA — persona skipped); `not_budget_turn` = inbound not budget-fit. For `inquiry_budget_sensitive` with the QA fixture, expect `inject` and `budget_clause_mode` === `deterministic_minimum_pivot`.",
    scenarios: results.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioLabel: r.scenarioLabel,
      reviewLens: r.reviewLens,
      reviewLensGuidance: r.reviewLensGuidance,
      finalState: r.classification.finalState,
      classificationNotes: r.classificationNotesDisplay,
      voiceSampleForAnaToneReview: r.voiceSampleForAnaToneReview,
      evidence: r.classification.evidence,
      primaryEventId: r.primaryEventId,
      correlation: r.correlation,
      seeded: r.seeded,
      inngestEventIds: r.inngestEventIds,
      draftId: r.draft?.id ?? null,
      draftCreatedAt: r.draft?.created_at ?? null,
      settleTimedOut: r.settleTimedOut,
      fullFinalDraftBody: r.draft?.bodyFull ?? null,
      instructionHistorySteps: r.classification.evidence.stepNames,
      personaCommittedTerms: r.classification.evidence.personaCommittedTerms,
      escalationsAfterSeed: r.escalationsAfterSeed,
      outputAuditorRejected: r.classification.evidence.auditorRejectedByHistory || r.classification.evidence.outputAuditorMarkerInBody,
      toneVerdict: r.tone.verdict,
      toneNotes: r.tone.notes,
      eventSent: r.eventSent,
      derivedInquiryReplyPlan: r.derivedInquiryReplyPlan,
      budgetStatementInjectionPlan: r.budgetStatementInjectionPlan,
      budgetTurnOutcome: r.budgetTurnOutcome,
      playbookRulesLoaded: r.playbookRulesLoaded,
    })),
  };

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = `# V3 inquiry writing — hosted Inngest QA

- **Generated:** ${new Date().toISOString()}
- **Run id:** \`${runId}\`
- **JSON:** \`${jsonPath.replace(/\\/g, "/")}\` (full draft bodies are in JSON — avoids markdown escaping issues)
- **Settle:** ${report.settleConfig.maxAttempts} attempts × ${report.settleConfig.delayMs} ms (wait for \`persona_writer_after_client_orchestrator_v1\` or \`v3_pricing_data_guardrail_missing_verified_minimum\` in \`instruction_history\`)

## Path

${report.pathExercised}

## ${report.cleanupNote}

## Classification (reliability)

${report.classificationLegend}

- **availability_calendar_and_booking_policy** (\`inquiry_availability_timeline\`): evaluate calendar/availability and booking *grounding* first; do not treat odd phrasing as an Ana tone regression.
- **ana_voice_sample**: when \`finalState\` is \`persona_final\`, the body is a valid Ana voice sample for manual review (tone/heuristic still apply).

## Author assessment (automation + manual read)

${authorAssessment}

${errors.length > 0 ? `## Errors (partial run)\n\n${errors.map((e) => `- **${e.scenarioId}:** ${e.message}`).join("\n")}\n` : ""}
## Scenarios (summary)

${report.scenarios
  .map(
    (s) => `### ${s.scenarioId}

- **Label:** ${s.scenarioLabel}
- **Review lens:** ${s.reviewLens}
- **Lens guidance:** ${s.reviewLensGuidance}
- **finalState:** \`${s.finalState}\` — ${s.classificationNotes}
- **Voice sample (Ana tone):** ${s.voiceSampleForAnaToneReview ? "yes (persona_final + ana_voice_sample scenario)" : "no — use classification / lens before judging tone"}
- **Primary event id:** ${s.primaryEventId ?? "(none)"}
- **Inngest event ids:** ${s.inngestEventIds?.join(", ") ?? "(none)"}
- **Draft id:** ${s.draftId ?? "(none)"}
- **Settle timed out:** ${s.settleTimedOut ? "yes (see stub_fallback vs slow worker)" : "no"}
- **Output auditor rejected:** ${s.outputAuditorRejected ? "yes" : "no"}
- **Escalations (after seed, this thread):** ${s.escalationsAfterSeed.length ? s.escalationsAfterSeed.map((e) => `\`${e.id}\` (${e.reason_code})`).join(", ") : "(none)"}
- **Instruction steps:** ${s.instructionHistorySteps.join(" → ") || "(none)"}
- **Derived inquiry reply-plan (demo, see report note):** ${s.derivedInquiryReplyPlan ? `\`${JSON.stringify(s.derivedInquiryReplyPlan)}\`` : "(null)"}
- **Budget turn outcome:** \`${s.budgetTurnOutcome}\` (see \`budgetStatementInjectionPlan\` in JSON)
- **Tone (heuristic, not classification):** ${s.toneVerdict} — ${s.toneNotes}
`,
  )
  .join("\n")}
`;

  writeFileSync(mdPath, md, "utf8");

  console.error(`\nWrote:\n  ${mdPath}\n  ${jsonPath}`);
  if (errors.length > 0) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
