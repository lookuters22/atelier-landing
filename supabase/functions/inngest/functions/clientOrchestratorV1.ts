/**
 * Phase 7 Step 7B — main **client** orchestrator for email/web (narrow slice).
 *
 * Flow: build decision context → **structured candidate proposals** (A1) → `toolVerifier` → **optional
 * `drafts` insert** (A2, QA/replay) when eligible → **optional `toolEscalate` artifact** (A3, block/ask) →
 * optional `toolCalculator` placeholder.
 * **Invocations:** QA/replay (`qa_runner`); optional **shadow** fanout from `triage` when
 * `TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1=1` (observation only). **CUT4–CUT8 live:** main-path gates may dispatch here
 * with **`draft_only`** when the corresponding env flags are on (post-ingest routing).
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
 * **V3 CUT4:** When live main-path concierge includes `cut4LiveCorrelationId`, emits
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
import { applyMissingComplianceAssetOperatorProposals } from "../../_shared/orchestrator/complianceAssetMissingCapture.ts";
import { syncComplianceWhatsAppPendingCollectState } from "../../_shared/orchestrator/complianceWhatsAppPendingCollect.ts";
import { maybeRewriteOrchestratorDraftWithPersona } from "../../_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts";
import { enrichProposalsWithComplianceAssetResolution } from "../../_shared/orchestrator/resolveComplianceAssetStorage.ts";
import { recordStrategicTrustRepairEscalation } from "../../_shared/orchestrator/recordStrategicTrustRepairEscalation.ts";
import { maybeRecordOrchestratorNoDraftableEscalation } from "../../_shared/orchestrator/recordOrchestratorNoDraftableEscalation.ts";
import { upsertV3ThreadWorkflowFromInboundMessage } from "../../_shared/workflow/v3ThreadWorkflowRepository.ts";
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

    const inboundSenderEmail =
      typeof event.data.inboundSenderEmail === "string" ? event.data.inboundSenderEmail : undefined;
    const inboundSenderDisplayName =
      typeof event.data.inboundSenderDisplayName === "string"
        ? event.data.inboundSenderDisplayName
        : undefined;

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
        undefined,
        inboundSenderEmail,
        inboundSenderDisplayName,
        undefined,
        undefined,
      ),
    );

    await step.run("v3-workflow-upsert-inbound", async () => {
      if (skipIntakeParityDbSideEffects || !threadId) {
        return { skipped: true as const };
      }
      await upsertV3ThreadWorkflowFromInboundMessage(supabaseAdmin, {
        photographerId,
        threadId,
        weddingId,
        rawMessage,
      });
      return { skipped: false as const };
    });

    const heavyContextLayers = await step.run("orchestrator-assemble-heavy-context-layers", async () =>
      assembleHeavyContextForClientOrchestratorV1(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        decisionContext,
      ),
    );

    const proposeResult = await step.run("propose-candidate-actions", async () =>
      proposeCandidateActionsForClientOrchestratorV1(
        heavyContextLayers,
        decisionContext,
        weddingId,
        threadId,
        replyChannel,
        rawMessage,
        requestedExecutionMode,
      ),
    );
    const { proposals: proposedRaw, orchestratorContextInjection } = proposeResult;

    /** Parity with `executeClientOrchestratorV1Core`: storage resolution + missing-file operator remap + WhatsApp pending. */
    const proposedActions = await step.run("orchestrator-compliance-enrich-and-pending-sync", async () => {
      let p = await enrichProposalsWithComplianceAssetResolution(
        supabaseAdmin,
        photographerId,
        proposedRaw,
      );
      p = applyMissingComplianceAssetOperatorProposals(p);
      if (!skipIntakeParityDbSideEffects) {
        await syncComplianceWhatsAppPendingCollectState(supabaseAdmin, photographerId, {
          weddingId,
          threadId,
          proposals: p,
        });
      }
      return p;
    });

    await step.run("strategic-trust-repair-durable", async () => {
      if (skipIntakeParityDbSideEffects || !threadId) {
        return { skipped: true as const, reason: "intake_parity_or_no_thread" as const };
      }
      return recordStrategicTrustRepairEscalation(supabaseAdmin, {
        photographerId,
        threadId,
        weddingId,
        rawMessage,
        threadContextSnippet: heavyContextLayers.threadContextSnippet,
      });
    });

    const verifierResult = await step.run("tool-verifier", async () =>
      runToolVerifierForClientOrchestratorV1(
        heavyContextLayers,
        requestedExecutionMode,
        rawMessage,
        photographerId,
        threadId,
        weddingId,
        proposedActions,
      ),
    );

    const orchestratorOutcome = mapClientOrchestratorV1Outcome(
      verifierResult.success,
      requestedExecutionMode,
      verifierResult.facts,
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
              weddingId,
              proposedActions,
              verifierSuccess: verifierResult.success === true,
              orchestratorOutcome,
              rawMessage,
              replyChannel,
              playbookRules: heavyContextLayers.playbookRules,
              audience: decisionContext.audience,
              crmSnapshotForPause: decisionContext.crmSnapshot,
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
        const personaStructuredFailure = result.violations?.some((v) =>
          v.startsWith("persona_structured_output_failed:"),
        );
        console.log(
          JSON.stringify({
            type: personaStructuredFailure
              ? "orchestrator_persona_draft_structured_output_failed"
              : "orchestrator_persona_draft_audit_rejected",
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

    await step.run(
      skipIntakeParityDbSideEffects
        ? "record-no-draftable-operator-escalation-skipped-intake-parity"
        : "record-no-draftable-operator-escalation",
      async () => {
        if (skipIntakeParityDbSideEffects || !threadId) {
          return { recorded: false as const, reason: "skipped_intake_parity_or_no_thread" as const };
        }
        return maybeRecordOrchestratorNoDraftableEscalation(supabaseAdmin, {
          photographerId,
          threadId,
          weddingId,
          verifierSuccess: verifierResult.success === true,
          orchestratorOutcome,
          draftSkipReason: draftAttempt.skipReason ?? null,
          draftCreated: draftAttempt.draftCreated,
          proposedActions,
          rawMessage,
        });
      },
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
      orchestratorContextInjection,
      requestedExecutionMode,
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
