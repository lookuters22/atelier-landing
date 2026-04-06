#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Focused QA: proactive Inngest flows only (no WhatsApp Orchestrator V2).
 *
 * Sends: crm/stage.updated (contract_out) + calendar/event.booked
 * Loads repo `.env` / `supabase/.env` via `_qa_env.ts`.
 * Needs: service_role key + INNGEST_EVENT_KEY
 * Optional: QA_FIXTURES_PATH, QA_POST_EVENTS_MS (default 20000) — wait after send before DB check
 * Optional: QA_ORCHESTRATOR_SKIP=1 — skip Phase 2 B1 client orchestrator replay block
 * Optional: QA_ORCHESTRATOR_INCLUDE_UNFILED=1 — run extra replay with weddingId/threadId null (no triage)
 *
 * execute_v3 Step 12B (narrow harness): after tenant check, verifies `playbook_rules` aligns with
 * `photographers.settings` contract when identity/locale fields are set — i.e. `studio_settings_contract`
 * exists (contract + action_key from `../_shared/studioSettingsContractPlaybook.ts`; backfill in
 * `backfillPhotographerSettingsToPlaybook.ts` / `npm run backfill:12a`). Logs known-default coverage
 * (`discount_quote`, etc.) without failing when absent on a bare QA seed.
 *
 * Phase 2 Slice B1: synchronous replay of `ai/orchestrator.client.v1` via `runClientOrchestratorV1QaReplay`
 * (same decision-context path as the worker; QA-only broadcast override for high-risk verifier case).
 * Does not emit orchestrator events to Inngest — not live routing.
 *
 * Phase 2 Slice B2: per-scenario `parity_pass` | `parity_gap` | `skipped` vs coarse legacy-expected
 * behavior class (outcome / draft row / escalation artifact flags) — observability only; no legacy worker calls.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  loadQaEnvFromRepo,
  resolveInngestEventKey,
  resolveServiceRoleKey,
} from "./_qa_env.ts";
import {
  ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
  hasMeaningfulStudioSettingsContract,
} from "../_shared/studioSettingsContractPlaybook.ts";
import { ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION } from "../_shared/inngest.ts";
import {
  type ClientOrchestratorV1QaReplayResult,
  runClientOrchestratorV1QaReplay,
  type ClientOrchestratorV1ExecutionMode,
} from "../_shared/orchestrator/runClientOrchestratorV1QaReplay.ts";
import {
  evaluateOrchestratorLegacyParity,
  legacyParityExpectationFromHarnessScenario,
} from "../_shared/orchestrator/orchestratorLegacyParityQa.ts";
import type { BroadcastRiskLevel } from "../../../src/types/decisionContext.types.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

await loadQaEnvFromRepo();

type Fixtures = {
  photographerId: string;
  weddingId: string;
  threadId: string;
  calendarEventId: string;
  startTime: string;
  email: string;
};

function env(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

async function loadFixtures(): Promise<Fixtures> {
  const override = env("QA_FIXTURES_PATH");
  const abs = override ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".qa_fixtures.json");
  const raw = await Deno.readTextFile(abs);
  return JSON.parse(raw) as Fixtures;
}

function supabaseUrl(): string {
  const u = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL or VITE_SUPABASE_URL required");
  return u;
}

async function sendInngest(
  events: Array<{ name: string; data: Record<string, unknown> }>,
): Promise<void> {
  const key = resolveInngestEventKey();
  if (!key) {
    throw new Error(
      "INNGEST_EVENT_KEY required in .env (Inngest Cloud → environment → Event key for sending events)",
    );
  }
  const url = "https://inn.gs/e/" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("Inngest send failed " + String(res.status) + ": " + text);
  }
  console.log("[inngest]", res.status, text.slice(0, 200));
}

async function countDraftsForThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if (error) throw new Error("drafts count: " + error.message);
  return count ?? 0;
}

async function listDraftsForThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<Array<{ id: string; instruction_history: unknown }>> {
  const { data, error } = await supabase
    .from("drafts")
    .select("id, instruction_history")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(20);
  if (error) throw new Error("drafts list: " + error.message);
  return (data ?? []) as Array<{ id: string; instruction_history: unknown }>;
}

async function assertThreadTenant(
  supabase: SupabaseClient,
  threadId: string,
  photographerId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("threads")
    .select("photographer_id")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new Error("threads: " + error.message);
  const row = data as { photographer_id: string } | null;
  if (!row || row.photographer_id !== photographerId) {
    throw new Error("Thread tenant mismatch or missing thread row");
  }
}

/**
 * Step 12B QA slice: playbook_rules vs settings contract + visibility into known-default rows.
 */
async function runStep12bPlaybookHarness(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<void> {
  const { data: ph, error: phErr } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();
  if (phErr) throw new Error("photographers settings: " + phErr.message);

  const { data: rules, error: rErr } = await supabase
    .from("playbook_rules")
    .select("action_key, source_type, scope")
    .eq("photographer_id", photographerId)
    .eq("is_active", true);
  if (rErr) throw new Error("playbook_rules: " + rErr.message);

  const actionKeys = [...new Set((rules ?? []).map((r) => (r as { action_key: string }).action_key))]
    .sort();
  console.log("=== Step 12B harness (playbook_rules vs settings contract) ===");
  console.log("[Step 12B] active playbook_rules count:", (rules ?? []).length);
  console.log("[Step 12B] action_keys:", actionKeys.length ? actionKeys.join(", ") : "(none)");

  const hasContractInSettings = hasMeaningfulStudioSettingsContract(ph?.settings);
  const hasStudioRule = actionKeys.includes(ACTION_KEY_STUDIO_SETTINGS_CONTRACT);

  if (hasContractInSettings && !hasStudioRule) {
    throw new Error(
      "Step 12B: settings contain studio contract fields but playbook_rules is missing action_key " +
        ACTION_KEY_STUDIO_SETTINGS_CONTRACT +
        " — run `npm run backfill:12a` (or complete equivalent backfill).",
    );
  }
  if (hasContractInSettings && hasStudioRule) {
    console.log(
      "PASS: studio contract fields in settings and playbook has " + ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
    );
  } else if (!hasContractInSettings) {
    console.log(
      "SKIP: no studio contract fields in photographers.settings (studio_settings_contract not required)",
    );
  }

  const hasDiscountDefault = actionKeys.includes("discount_quote");
  const hasEscalationRouting = actionKeys.includes("operator_notification_routing");
  console.log(
    "[Step 12B] known defaults snapshot — discount_quote:",
    hasDiscountDefault ? "present" : "absent",
    "| operator_notification_routing:",
    hasEscalationRouting ? "present" : "absent",
    "(informational until onboarding / defaults backfill)",
  );
}

type OrchestratorOutcomeClass = "auto" | "draft" | "ask" | "block";

function assertOrchestratorReplayStructure(
  scenarioId: string,
  result: ClientOrchestratorV1QaReplayResult,
): void {
  if (result.schemaVersion !== ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION) {
    throw new Error(
      "[B1][" + scenarioId + "] schemaVersion mismatch (expected " +
        String(ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION) + ")",
    );
  }
  if (!Array.isArray(result.proposedActions)) {
    throw new Error("[B1][" + scenarioId + "] proposedActions must be an array");
  }
  if (
    typeof result.proposalCount !== "number" ||
    result.proposalCount !== result.proposedActions.length
  ) {
    throw new Error("[B1][" + scenarioId + "] proposalCount must equal proposedActions.length");
  }
  if (!result.verifierResult || typeof result.verifierResult.success !== "boolean") {
    throw new Error("[B1][" + scenarioId + "] verifierResult missing or invalid");
  }
  if (!result.draftAttempt || typeof result.draftAttempt.draftCreated !== "boolean") {
    throw new Error("[B1][" + scenarioId + "] draftAttempt missing or invalid");
  }
  if (
    !result.escalationAttempt ||
    typeof result.escalationAttempt.escalationArtifactCreated !== "boolean"
  ) {
    throw new Error("[B1][" + scenarioId + "] escalationAttempt missing or invalid");
  }
  const oc = result.orchestratorOutcome;
  if (oc !== "auto" && oc !== "draft" && oc !== "ask" && oc !== "block") {
    throw new Error("[B1][" + scenarioId + "] invalid orchestratorOutcome: " + String(oc));
  }
}

/**
 * Phase 2 B1 — replay `clientOrchestratorV1` pipeline (no Inngest event to triage).
 */
async function runB1OrchestratorReplayHarness(
  supabase: SupabaseClient,
  fixtures: Fixtures,
): Promise<void> {
  const rawMessage =
    "[QA B1] Orchestrator replay probe — deterministic body for parity checks.";

  type ScenarioRow = {
    id: string;
    requestedExecutionMode: ClientOrchestratorV1ExecutionMode;
    qaBroadcastRiskOverride?: BroadcastRiskLevel;
    expectedOutcome: OrchestratorOutcomeClass;
    requireEscalationArtifact: boolean;
    warnDraftOutcomeWithoutDraft: boolean;
    weddingId: string | null;
    threadId: string | null;
    skip: string | null;
  };

  const rows: ScenarioRow[] = [];

  const threadOk = Boolean(fixtures.threadId?.trim());
  const weddingOk = Boolean(fixtures.weddingId?.trim());

  rows.push({
    id: "auto_default",
    requestedExecutionMode: "auto",
    expectedOutcome: "auto",
    requireEscalationArtifact: false,
    warnDraftOutcomeWithoutDraft: false,
    weddingId: weddingOk ? fixtures.weddingId : null,
    threadId: threadOk ? fixtures.threadId : null,
    skip: !weddingOk || !threadOk
      ? "fixtures missing weddingId or threadId — skip known-wedding replay"
      : null,
  });

  rows.push({
    id: "draft_only",
    requestedExecutionMode: "draft_only",
    expectedOutcome: "draft",
    requireEscalationArtifact: false,
    warnDraftOutcomeWithoutDraft: true,
    weddingId: weddingOk ? fixtures.weddingId : null,
    threadId: threadOk ? fixtures.threadId : null,
    skip: !threadOk
      ? "fixtures.threadId missing — cannot exercise thread-scoped draft insert (A2)"
      : null,
  });

  rows.push({
    id: "ask_first",
    requestedExecutionMode: "ask_first",
    expectedOutcome: "ask",
    requireEscalationArtifact: true,
    warnDraftOutcomeWithoutDraft: false,
    weddingId: weddingOk ? fixtures.weddingId : null,
    threadId: threadOk ? fixtures.threadId : null,
    skip: !weddingOk || !threadOk
      ? "fixtures missing weddingId or threadId — skip ask_first on known thread"
      : null,
  });

  rows.push({
    id: "block_forbidden",
    requestedExecutionMode: "forbidden",
    expectedOutcome: "block",
    requireEscalationArtifact: true,
    warnDraftOutcomeWithoutDraft: false,
    weddingId: weddingOk ? fixtures.weddingId : null,
    threadId: threadOk ? fixtures.threadId : null,
    skip: !weddingOk || !threadOk
      ? "fixtures missing weddingId or threadId — skip forbidden replay"
      : null,
  });

  rows.push({
    id: "block_high_broadcast",
    requestedExecutionMode: "auto",
    qaBroadcastRiskOverride: "high",
    expectedOutcome: "block",
    requireEscalationArtifact: true,
    warnDraftOutcomeWithoutDraft: false,
    weddingId: weddingOk ? fixtures.weddingId : null,
    threadId: threadOk ? fixtures.threadId : null,
    skip: !weddingOk || !threadOk
      ? "fixtures missing weddingId or threadId — skip broadcast-risk replay"
      : null,
  });

  if (env("QA_ORCHESTRATOR_INCLUDE_UNFILED") === "1") {
    rows.push({
      id: "unfiled_no_thread",
      requestedExecutionMode: "auto",
      expectedOutcome: "auto",
      requireEscalationArtifact: false,
      warnDraftOutcomeWithoutDraft: false,
      weddingId: null,
      threadId: null,
      skip: null,
    });
  } else {
    console.log(
      "[B1] SKIP optional scenario unfiled_no_thread (set QA_ORCHESTRATOR_INCLUDE_UNFILED=1 to run)",
    );
  }

  console.log("=== B1 harness — ai/orchestrator.client.v1 replay (QA-only, no triage) ===");

  const beforeDrafts = threadOk
    ? await countDraftsForThread(supabase, fixtures.threadId)
    : null;

  let scenariosExecuted = 0;
  let parityPassCount = 0;
  let parityGapCount = 0;
  let skippedCount = 0;

  for (const sc of rows) {
    const legacy = legacyParityExpectationFromHarnessScenario({
      expectedOutcome: sc.expectedOutcome,
      warnDraftOutcomeWithoutDraft: sc.warnDraftOutcomeWithoutDraft,
      requireEscalationArtifact: sc.requireEscalationArtifact,
    });

    if (sc.skip !== null) {
      skippedCount += 1;
      const parity = evaluateOrchestratorLegacyParity({
        scenarioId: sc.id,
        skipReason: sc.skip,
        result: null,
        legacy,
      });
      console.log("[B1][" + sc.id + "] SKIP:", sc.skip);
      console.log("[B2]", JSON.stringify(parity.paritySignals));
      continue;
    }

    scenariosExecuted += 1;

    const result = await runClientOrchestratorV1QaReplay({
      supabase,
      photographerId: fixtures.photographerId,
      weddingId: sc.weddingId,
      threadId: sc.threadId,
      replyChannel: "email",
      rawMessage,
      requestedExecutionMode: sc.requestedExecutionMode,
      qaBroadcastRiskOverride: sc.qaBroadcastRiskOverride,
    });

    assertOrchestratorReplayStructure(sc.id, result);

    const parity = evaluateOrchestratorLegacyParity({
      scenarioId: sc.id,
      skipReason: null,
      result,
      legacy,
    });

    if (parity.parityStatus === "parity_pass") {
      parityPassCount += 1;
    } else if (parity.parityStatus === "parity_gap") {
      parityGapCount += 1;
      console.warn(
        "[B2][" + sc.id + "] parity_gap:",
        parity.parityGapCodes.join(";"),
        "|",
        parity.parityGapDetails.join(" | "),
      );
    }

    console.log(
      "[B2]",
      JSON.stringify({
        scenarioId: sc.id,
        parity_status: parity.parityStatus,
        parity_gap_codes: parity.parityGapCodes,
        parity_signals: parity.paritySignals,
      }),
    );

    if (result.orchestratorOutcome !== sc.expectedOutcome) {
      throw new Error(
        "[B1][" + sc.id + "] expected orchestratorOutcome " + sc.expectedOutcome + " got " +
          result.orchestratorOutcome,
      );
    }

    if (sc.requireEscalationArtifact && !result.escalationArtifactCreated) {
      throw new Error(
        "[B1][" + sc.id + "] expected escalation artifact (block/ask path) but escalationArtifactCreated=false — " +
          (result.escalationAttempt.skipReason ?? result.escalationAttempt.toolEscalateError ?? "?"),
      );
    }

    if (
      sc.warnDraftOutcomeWithoutDraft &&
      result.orchestratorOutcome === "draft" &&
      !result.draftCreated
    ) {
      console.warn(
        "[B1][" + sc.id + "] GAP: outcome draft but no draft row —",
        result.draftAttempt.skipReason ?? "unknown",
        "| neither:",
        result.neitherDraftNorEscalationReason,
      );
    }

    const report = {
      scenarioId: sc.id,
      proposalCount: result.proposalCount,
      orchestratorOutcome: result.orchestratorOutcome,
      draftCreated: result.draftCreated,
      draftSkipReason: result.draftAttempt.skipReason,
      escalationArtifactCreated: result.escalationArtifactCreated,
      escalationSkipReason: result.escalationAttempt.skipReason,
      neitherDraftNorEscalationReason: result.neitherDraftNorEscalationReason,
      verifierSuccess: result.verifierResult.success,
      verifierError: result.verifierResult.error,
      parity_status: parity.parityStatus,
      parity_gap_codes: parity.parityGapCodes,
    };
    console.log("[B1][" + sc.id + "] PASS —", JSON.stringify(report));
  }

  if (scenariosExecuted === 0) {
    console.warn(
      "[B1] No scenarios ran (all skipped). Provide weddingId + threadId in fixtures for core cases.",
    );
  }

  console.log(
    "=== B2 parity summary (readiness / cutover signal; not live routing) ===",
    JSON.stringify({
      parity_pass: parityPassCount,
      parity_gap: parityGapCount,
      skipped: skippedCount,
      executed: scenariosExecuted,
      parity_gap_means_not_ready_for_cutover: parityGapCount > 0,
    }),
  );

  if (threadOk && beforeDrafts !== null) {
    const afterDrafts = await countDraftsForThread(supabase, fixtures.threadId);
    console.log(
      "[B1] drafts count on fixture thread (before/after scenarios):",
      beforeDrafts,
      "→",
      afterDrafts,
      "(delta:",
      String(afterDrafts - beforeDrafts) + ")",
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fixtures = await loadFixtures();
const sr = resolveServiceRoleKey();
if (!sr) {
  throw new Error(
    "Service role key required: set SUPABASE_SERVICE_ROLE_KEY in .env (not the anon/publishable key)",
  );
}

const supabase = createClient(supabaseUrl(), sr);
const postEventsMs = Number(env("QA_POST_EVENTS_MS") ?? "20000");

console.log("=== QA runner (CRM + calendar only; WhatsApp orchestrator disabled) ===");
console.log("fixtures threadId:", fixtures.threadId);
console.log("fixtures weddingId:", fixtures.weddingId);
console.log("calendar startTime (ISO):", fixtures.startTime);

const before = await countDraftsForThread(supabase, fixtures.threadId);
console.log("[baseline] drafts for fixture thread:", before);

await assertThreadTenant(supabase, fixtures.threadId, fixtures.photographerId);
console.log("PASS: fixture thread belongs to photographer_id");

await runStep12bPlaybookHarness(supabase, fixtures.photographerId);

if (env("QA_ORCHESTRATOR_SKIP") === "1") {
  console.log("SKIP: B1 orchestrator replay (QA_ORCHESTRATOR_SKIP=1)");
} else {
  await runB1OrchestratorReplayHarness(supabase, fixtures);
}

// Align DB with milestone verify: `contractFollowupFunction` requires `weddings.stage === "contract_out"` after sleep.
const { error: stageErr } = await supabase
  .from("weddings")
  .update({ stage: "contract_out" })
  .eq("id", fixtures.weddingId)
  .eq("photographer_id", fixtures.photographerId);
if (stageErr) throw new Error("weddings update contract_out: " + stageErr.message);
console.log("PASS: wedding.stage set to contract_out (required for milestone follow-up verify)");

// --- Proactive flows only (client/whatsapp.inbound.v1 / comms/whatsapp.received.v2 intentionally not sent) ---
await sendInngest([
  {
    name: "crm/stage.updated",
    data: {
      weddingId: fixtures.weddingId,
      photographerId: fixtures.photographerId,
      previousStage: "inquiry",
      newStage: "contract_out",
    },
  },
  {
    name: "calendar/event.booked",
    data: {
      eventId: fixtures.calendarEventId,
      photographerId: fixtures.photographerId,
      weddingId: fixtures.weddingId,
      startTime: fixtures.startTime,
    },
  },
]);

console.log(
  "Waiting " + postEventsMs +
    " ms for Inngest to accept runs (drafts usually NOT here yet; sleeps: 3d contract, 24h/1h calendar)...",
);
await sleep(postEventsMs);

const after = await countDraftsForThread(supabase, fixtures.threadId);
console.log("[after wait] drafts for fixture thread:", after);

const rows = await listDraftsForThread(supabase, fixtures.threadId);
console.log("[drafts sample] rows:", JSON.stringify(rows, null, 2));

const delta = after - before;
console.log("=== Summary ===");
console.log("Draft count delta:", delta);
console.log(
  "NOTE: With QA 1m sleeps on Edge, expect drafts after ~2–3 minutes (contract ~1m + calendar two 1m sleeps sequential).",
);
console.log("QA send + DB read completed (exit 0).");
