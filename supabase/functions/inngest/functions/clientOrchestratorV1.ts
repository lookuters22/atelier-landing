/**
 * Phase 7 Step 7B — main **client** orchestrator for email/web (narrow slice).
 *
 * Flow: build decision context → **structured candidate proposals** (A1) → `toolVerifier` → **optional
 * `drafts` insert** (A2, QA/replay) when eligible → **optional `toolEscalate` artifact** (A3, block/ask) →
 * optional `toolCalculator` placeholder.
 * **Invocations:** QA/replay (`qa_runner`); optional **shadow** fanout from `triage` when
 * `TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1=1` (observation only). **CUT2 live (narrow):** web widget known-wedding may
 * dispatch here when `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1=1` with **`draft_only`** (not `auto`).
 *
 * Heavy context (`selectedMemories`, `globalKnowledge`, `playbookRules`, `audience`, escalations) feeds
 * deterministic proposal shaping — not big-model inventiveness.
 *
 * Outcome mapping (minimal): verifier failure or `forbidden` → block; `draft_only` → draft; `ask_first` → ask;
 * verifier pass + `auto` → auto.
 *
 * Implementation: each Inngest `step.run` delegates to `clientOrchestratorV1Core.ts` so QA replay shares the same logic.
 *
 * **Phase 2 B3:** When `triage` shadow fanout includes correlation fields, emits `[orchestrator.shadow.compare]` log
 * plus `shadow_readiness_comparison` on the function return (grep-friendly; no routing impact).
 *
 * **V3 CUT3:** When `triage` live CUT2 includes `cut2LiveCorrelationId`, emits `[orchestrator.cut2.live.observe]` log
 * plus `cut2_live_observation` on the return — draft/escalation/neither, skip reasons, rollback hints.
 *
 * **V3 CUT4:** When `triage` live main-path concierge includes `cut4LiveCorrelationId`, emits
 * `[orchestrator.cut4.live.observe]` + `cut4_live_observation`.
 *
 * **V3 CUT5:** Main-path `project_management` live includes `cut5LiveCorrelationId` → `[orchestrator.cut5.live.observe]`
 * + `cut5_live_observation`.
 *
 * **V3 CUT6:** Main-path `logistics` live includes `cut6LiveCorrelationId` → `[orchestrator.cut6.live.observe]`
 * + `cut6_live_observation`.
 *
 * **V3 CUT7:** Main-path `commercial` live includes `cut7LiveCorrelationId` → `[orchestrator.cut7.live.observe]`
 * + `cut7_live_observation`.
 *
 * **V3 CUT8:** Main-path `studio` live includes `cut8LiveCorrelationId` → `[orchestrator.cut8.live.observe]`
 * + `cut8_live_observation`.
 *
 * **Intake post-bootstrap parity:** When `intakeParityFanoutSource === "intake_post_bootstrap_parity"`, emits
 * `[orchestrator.intake.post_bootstrap.parity]` + `intake_post_bootstrap_parity_observation` (observation only;
 * **no** `drafts` insert or escalation artifact — proposals + verifier only; legacy `ai/intent.persona` remains
 * authoritative for live replies).
 *
 * **Intake post-bootstrap live (email):** When `intakeLiveFanoutSource === "intake_post_bootstrap_live_email"`, emits
 * `[orchestrator.intake.post_bootstrap.live_email]` + `intake_post_bootstrap_live_email_observation` — full
 * `draft_only` path (drafts/escalation may apply); intake worker skipped persona for that turn.
 *
 * **Intake payload web fanout (not client-intake migration):** When `intakeLiveWebFanoutSource === "intake_post_bootstrap_live_web"`,
 * emits `[orchestrator.intake.post_bootstrap.live_web]` + `intake_post_bootstrap_live_web_observation`. Client intake scope is email.
 */
import {
  inngest,
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  type ClientOrchestratorV1ExecutionMode,
  assembleHeavyContextForClientOrchestratorV1,
  buildClientOrchestratorV1CoreResultPayload,
  buildDecisionContextForClientOrchestratorV1,
  type PersonaOutputAuditorSummary,
  mapClientOrchestratorV1Outcome,
  orchestratorDraftAttemptSkippedIntakePostBootstrapParity,
  orchestratorEscalationArtifactSkippedIntakePostBootstrapParity,
  proposeCandidateActionsForClientOrchestratorV1,
  runCalculatorPlaceholderForClientOrchestratorV1,
  runDraftAttemptForClientOrchestratorV1,
  runEscalationArtifactForClientOrchestratorV1,
  runToolVerifierForClientOrchestratorV1,
} from "../../_shared/orchestrator/clientOrchestratorV1Core.ts";
import {
  buildCut2LiveOrchestratorObservationRecord,
  logCut2LiveOrchestratorObservationRecord,
  parseCut2LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut2LiveOrchestratorObservationRecord.ts";
import {
  buildCut4LiveOrchestratorObservationRecord,
  logCut4LiveOrchestratorObservationRecord,
  parseCut4LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut4LiveOrchestratorObservationRecord.ts";
import {
  buildCut5LiveOrchestratorObservationRecord,
  logCut5LiveOrchestratorObservationRecord,
  parseCut5LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut5LiveOrchestratorObservationRecord.ts";
import {
  buildCut6LiveOrchestratorObservationRecord,
  logCut6LiveOrchestratorObservationRecord,
  parseCut6LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut6LiveOrchestratorObservationRecord.ts";
import {
  buildCut7LiveOrchestratorObservationRecord,
  logCut7LiveOrchestratorObservationRecord,
  parseCut7LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut7LiveOrchestratorObservationRecord.ts";
import {
  buildCut8LiveOrchestratorObservationRecord,
  logCut8LiveOrchestratorObservationRecord,
  parseCut8LiveCorrelationFromEventData,
} from "../../_shared/orchestrator/cut8LiveOrchestratorObservationRecord.ts";
import {
  buildIntakeLivePostBootstrapOrchestratorObservationRecord,
  logIntakeLivePostBootstrapOrchestratorObservationRecord,
  parseIntakeLivePostBootstrapEmailFromEventData,
} from "../../_shared/orchestrator/intakeLivePostBootstrapOrchestratorObservationRecord.ts";
import {
  buildIntakeLivePostBootstrapWebOrchestratorObservationRecord,
  logIntakeLivePostBootstrapWebOrchestratorObservationRecord,
  parseIntakeLivePostBootstrapWebFromEventData,
} from "../../_shared/orchestrator/intakeLivePostBootstrapWebOrchestratorObservationRecord.ts";
import {
  buildIntakePostBootstrapParityObservationRecord,
  logIntakePostBootstrapParityObservationRecord,
  parseIntakePostBootstrapParityFromEventData,
} from "../../_shared/orchestrator/intakePostBootstrapOrchestratorObservationRecord.ts";
import { maybeRewriteOrchestratorDraftWithPersona } from "../../_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts";
import {
  buildShadowOrchestratorReadinessRecord,
  logShadowOrchestratorReadinessRecord,
  parseShadowCorrelationFromEventData,
} from "../../_shared/orchestrator/shadowOrchestratorComparisonRecord.ts";

export const clientOrchestratorV1Function = inngest.createFunction(
  { id: "client-orchestrator-v1", name: "Client Orchestrator V1 (email/web)" },
  { event: ORCHESTRATOR_CLIENT_V1_EVENT },
  async ({ event, step }) => {
    const {
      schemaVersion,
      photographerId,
      weddingId,
      threadId,
      replyChannel,
      rawMessage,
    } = event.data;

    if (schemaVersion !== ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported ai/orchestrator.client.v1 schemaVersion: ${String(schemaVersion)}`,
      );
    }

    const requestedExecutionMode: ClientOrchestratorV1ExecutionMode =
      event.data.requestedExecutionMode ?? "auto";

    const intakePostBootstrapParityEarly = parseIntakePostBootstrapParityFromEventData(
      event.data as Record<string, unknown>,
    );
    const skipIntakeParityDbSideEffects = intakePostBootstrapParityEarly !== null;

    const decisionContext = await step.run("build-decision-context", async () =>
      buildDecisionContextForClientOrchestratorV1(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        replyChannel,
        rawMessage,
        undefined,
      ),
    );

    const heavyContextLayers = await step.run("orchestrator-assemble-heavy-context-layers", async () =>
      assembleHeavyContextForClientOrchestratorV1(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        decisionContext,
      ),
    );

    const proposedActions = await step.run("propose-candidate-actions", async () =>
      proposeCandidateActionsForClientOrchestratorV1(
        heavyContextLayers,
        weddingId,
        threadId,
        replyChannel,
        rawMessage,
        requestedExecutionMode,
      ),
    );

    const verifierResult = await step.run("tool-verifier", async () =>
      runToolVerifierForClientOrchestratorV1(
        heavyContextLayers,
        requestedExecutionMode,
        rawMessage,
        photographerId,
        threadId,
        weddingId,
      ),
    );

    const orchestratorOutcome = mapClientOrchestratorV1Outcome(
      verifierResult.success,
      requestedExecutionMode,
    );

    const draftAttempt = await step.run(
      skipIntakeParityDbSideEffects
        ? "create-orchestrator-draft-skipped-intake-parity"
        : "create-orchestrator-draft",
      async () =>
        skipIntakeParityDbSideEffects
          ? orchestratorDraftAttemptSkippedIntakePostBootstrapParity()
          : runDraftAttemptForClientOrchestratorV1(supabaseAdmin, {
              photographerId,
              threadId,
              proposedActions,
              verifierSuccess: verifierResult.success === true,
              orchestratorOutcome,
              rawMessage,
              replyChannel,
              playbookRules: heavyContextLayers.playbookRules,
            }),
    );

    const personaRewriteResult = await step.run("persona-rewrite-orchestrator-draft", async () => {
      if (skipIntakeParityDbSideEffects || !draftAttempt.draftCreated) {
        return { applied: false as const, reason: "skipped" as const };
      }
      const result = await maybeRewriteOrchestratorDraftWithPersona(supabaseAdmin, {
        decisionContext,
        draftAttempt,
        rawMessage,
        playbookRules: heavyContextLayers.playbookRules,
        photographerId,
        replyChannel,
        threadId,
      });
      if (result.applied && result.auditPassed) {
        console.log(
          JSON.stringify({
            type: "orchestrator_persona_draft_rewrite",
            draftId: result.draftId,
            auditPassed: true,
          }),
        );
      } else if (result.applied && !result.auditPassed) {
        console.log(
          JSON.stringify({
            type: "orchestrator_persona_draft_audit_rejected",
            draftId: result.draftId,
            violations: result.violations,
            escalationId: result.escalationId,
          }),
        );
      } else {
        console.log(
          JSON.stringify({
            type: "orchestrator_persona_draft_rewrite_skipped",
            reason: result.reason,
          }),
        );
      }
      return result;
    });

    let personaOutputAuditor: PersonaOutputAuditorSummary | undefined;
    if (skipIntakeParityDbSideEffects || !draftAttempt.draftCreated) {
      personaOutputAuditor = { ran: false, reason: "skipped_intake_parity_or_no_draft" };
    } else if (!personaRewriteResult.applied) {
      personaOutputAuditor = { ran: false, reason: personaRewriteResult.reason };
    } else if (personaRewriteResult.auditPassed) {
      personaOutputAuditor = {
        ran: true,
        passed: true,
        draftId: personaRewriteResult.draftId,
      };
    } else {
      personaOutputAuditor = {
        ran: true,
        passed: false,
        draftId: personaRewriteResult.draftId,
        violations: personaRewriteResult.violations,
        escalationId: personaRewriteResult.escalationId,
      };
    }

    const escalationAttempt = await step.run(
      skipIntakeParityDbSideEffects
        ? "tool-escalate-artifact-skipped-intake-parity"
        : "tool-escalate-artifact",
      async () =>
        skipIntakeParityDbSideEffects
          ? orchestratorEscalationArtifactSkippedIntakePostBootstrapParity()
          : runEscalationArtifactForClientOrchestratorV1(photographerId, {
              orchestratorOutcome,
              verifierResult,
              requestedExecutionMode,
              rawMessage,
              broadcastRisk: heavyContextLayers.audience.broadcastRisk,
              proposedActions,
              threadId,
              weddingId,
            }),
    );

    /** Only when verifier passes — matches pre-refactor worker (no calculator step on block). Intake parity skips I/O. */
    const calculatorResult =
      verifierResult.success === true && !skipIntakeParityDbSideEffects
        ? await step.run("tool-calculator-placeholder", async () =>
            runCalculatorPlaceholderForClientOrchestratorV1(true, photographerId),
          )
        : null;

    const coreResult = buildClientOrchestratorV1CoreResultPayload(
      photographerId,
      heavyContextLayers,
      proposedActions,
      verifierResult,
      draftAttempt,
      escalationAttempt,
      calculatorResult,
      orchestratorOutcome,
      personaOutputAuditor,
    );

    const cut8LiveCorrelation = parseCut8LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut8LiveCorrelation) {
      const cut8Observation = buildCut8LiveOrchestratorObservationRecord(
        cut8LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut8LiveOrchestratorObservationRecord(cut8Observation);
      return {
        ...coreResult,
        cut8_live_observation: cut8Observation,
      };
    }

    const cut7LiveCorrelation = parseCut7LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut7LiveCorrelation) {
      const cut7Observation = buildCut7LiveOrchestratorObservationRecord(
        cut7LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut7LiveOrchestratorObservationRecord(cut7Observation);
      return {
        ...coreResult,
        cut7_live_observation: cut7Observation,
      };
    }

    const cut6LiveCorrelation = parseCut6LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut6LiveCorrelation) {
      const cut6Observation = buildCut6LiveOrchestratorObservationRecord(
        cut6LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut6LiveOrchestratorObservationRecord(cut6Observation);
      return {
        ...coreResult,
        cut6_live_observation: cut6Observation,
      };
    }

    const cut5LiveCorrelation = parseCut5LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut5LiveCorrelation) {
      const cut5Observation = buildCut5LiveOrchestratorObservationRecord(
        cut5LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut5LiveOrchestratorObservationRecord(cut5Observation);
      return {
        ...coreResult,
        cut5_live_observation: cut5Observation,
      };
    }

    const cut4LiveCorrelation = parseCut4LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut4LiveCorrelation) {
      const cut4Observation = buildCut4LiveOrchestratorObservationRecord(
        cut4LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut4LiveOrchestratorObservationRecord(cut4Observation);
      return {
        ...coreResult,
        cut4_live_observation: cut4Observation,
      };
    }

    const cut2LiveCorrelation = parseCut2LiveCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (cut2LiveCorrelation) {
      const cut2Observation = buildCut2LiveOrchestratorObservationRecord(
        cut2LiveCorrelation,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logCut2LiveOrchestratorObservationRecord(cut2Observation);
      return {
        ...coreResult,
        cut2_live_observation: cut2Observation,
      };
    }

    const intakeLivePostBootstrapEmail = parseIntakeLivePostBootstrapEmailFromEventData(
      event.data as Record<string, unknown>,
    );
    if (intakeLivePostBootstrapEmail && replyChannel === "email") {
      const intakeLiveObservation = buildIntakeLivePostBootstrapOrchestratorObservationRecord(
        intakeLivePostBootstrapEmail,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel: "email",
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logIntakeLivePostBootstrapOrchestratorObservationRecord(intakeLiveObservation);
      return {
        ...coreResult,
        intake_post_bootstrap_live_email_observation: intakeLiveObservation,
      };
    }

    const intakeLivePostBootstrapWeb = parseIntakeLivePostBootstrapWebFromEventData(
      event.data as Record<string, unknown>,
    );
    if (intakeLivePostBootstrapWeb && replyChannel === "web") {
      const intakeLiveWebObservation = buildIntakeLivePostBootstrapWebOrchestratorObservationRecord(
        intakeLivePostBootstrapWeb,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel: "web",
          requestedExecutionMode,
          verifierPassed: verifierResult.success === true,
        },
      );
      logIntakeLivePostBootstrapWebOrchestratorObservationRecord(intakeLiveWebObservation);
      return {
        ...coreResult,
        intake_post_bootstrap_live_web_observation: intakeLiveWebObservation,
      };
    }

    const intakePostBootstrapParity = intakePostBootstrapParityEarly;
    if (intakePostBootstrapParity) {
      const intakeParityObservation = buildIntakePostBootstrapParityObservationRecord(
        intakePostBootstrapParity,
        coreResult,
        {
          weddingId,
          threadId,
          replyChannel,
          requestedExecutionMode,
        },
      );
      logIntakePostBootstrapParityObservationRecord(intakeParityObservation);
      return {
        ...coreResult,
        intake_post_bootstrap_parity_observation: intakeParityObservation,
      };
    }

    const shadowCorrelation = parseShadowCorrelationFromEventData(
      event.data as Record<string, unknown>,
    );
    if (shadowCorrelation) {
      const readiness = buildShadowOrchestratorReadinessRecord(shadowCorrelation, coreResult, {
        weddingId,
        threadId,
        replyChannel,
        requestedExecutionMode,
      });
      logShadowOrchestratorReadinessRecord(readiness);
      return {
        ...coreResult,
        shadow_readiness_comparison: readiness,
      };
    }

    return coreResult;
  },
);
