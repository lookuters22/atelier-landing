/**
 * Classifier worker for canonical inbox threads (post–Gmail delta). Updates `threads` + optional near-match escalation;
 * boots inquiry wedding when intake + unlinked; dispatches without duplicating thread/message rows.
 *
 * Layered funnel: header heuristics (no LLM) → LLM for survivors → Gmail-specific dispatch policy (no unlinked fake intake).
 */
import { runTriageAgent } from "../../_shared/agents/triage.ts";
import { isTriageBoundedUnresolvedEmailMatchmakerEnabled } from "../../_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { insertBoundedUnresolvedMatchApprovalEscalation } from "../../_shared/triage/boundedUnresolvedMatchApprovalEscalation.ts";
import {
  buildAiRoutingMetadataForUnresolved,
  buildAiRoutingMetadataNonWeddingBusinessInquiry,
  buildAiRoutingMetadataUnlinkedHumanNoRoute,
  deriveEmailIngressRouting,
  enforceStageGate,
  matchmakerStageIntentForGmailClassifier,
  resolveDeterministicIdentity,
  runConditionalMatchmakerForEmail,
  type EmailIngressIdentity,
  type MatchmakerStepResult,
} from "../../_shared/triage/emailIngressClassification.ts";
import { routeNonWeddingBusinessInquiry } from "../../_shared/triage/nonWeddingBusinessInquiryRouter.ts";
import { evaluatePreLlmInboundEmail } from "../../_shared/triage/preLlmEmailRouting.ts";
import { applyUnlinkedWeddingLeadIntakeBoost } from "../../_shared/triage/unlinkedWeddingLeadIntakeBoost.ts";
import {
  type MainPathEmailDispatchResult,
  runMainPathEmailDispatch,
} from "../../_shared/triage/runMainPathEmailDispatch.ts";
import { extractEmailAddress } from "../../_shared/utils/extractEmailAddress.ts";
import { normalizeEmail } from "../../_shared/utils/normalizeEmail.ts";
import { bootstrapInquiryWeddingForCanonicalThread } from "../../_shared/resolvers/bootstrapInquiryWeddingForCanonicalThread.ts";
import { INBOX_THREAD_REQUIRES_TRIAGE_V1_EVENT, inngest } from "../../_shared/inngest.ts";

export const processInboxThreadRequiresTriage = inngest.createFunction(
  {
    id: "process-inbox-thread-requires-triage",
    name: "Inbox thread classifier (post-ingest)",
  },
  { event: INBOX_THREAD_REQUIRES_TRIAGE_V1_EVENT },
  async ({ event, step }) => {
    const { photographerId, threadId, triggerMessageId, source, traceId } = event.data;

    const threadRow = await step.run("load-thread", async () => {
      const { data, error } = await supabaseAdmin
        .from("threads")
        .select("id, wedding_id, photographer_id, title")
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw new Error(`load thread: ${error.message}`);
      return data;
    });

    if (!threadRow) {
      return { status: "error" as const, error: "thread_not_found", traceId };
    }
    if (threadRow.photographer_id !== photographerId) {
      return { status: "error" as const, error: "photographer_mismatch", traceId };
    }

    const messageRow = await step.run("load-trigger-message", async () => {
      const { data, error } = await supabaseAdmin
        .from("messages")
        .select("id, body, sender, thread_id, direction, metadata")
        .eq("id", triggerMessageId)
        .maybeSingle();
      if (error) throw new Error(`load message: ${error.message}`);
      return data;
    });

    if (!messageRow || messageRow.thread_id !== threadId) {
      return { status: "error" as const, error: "trigger_message_not_found", traceId };
    }
    if (messageRow.direction !== "in") {
      return { status: "skipped_non_inbound_trigger" as const, traceId };
    }

    const body = typeof messageRow.body === "string" ? messageRow.body : String(messageRow.body ?? "");
    const senderRaw = typeof messageRow.sender === "string" ? messageRow.sender : String(messageRow.sender ?? "");
    const senderForIdentity = normalizeEmail(extractEmailAddress(senderRaw) ?? senderRaw) || "";
    const messageMetadata =
      messageRow.metadata && typeof messageRow.metadata === "object"
        ? (messageRow.metadata as Record<string, unknown>)
        : null;

    const { identity, linkedProjectAtStart } = await step.run(
      "resolve-identity-for-routing",
      async (): Promise<{ identity: EmailIngressIdentity; linkedProjectAtStart: boolean }> => {
        const wid = threadRow.wedding_id as string | null;
        if (wid) {
          const { data: w, error } = await supabaseAdmin
            .from("weddings")
            .select("photographer_id, stage")
            .eq("id", wid)
            .eq("photographer_id", photographerId)
            .maybeSingle();
          if (error) throw new Error(`load linked wedding: ${error.message}`);
          if (w) {
            return {
              linkedProjectAtStart: true,
              identity: {
                weddingId: wid,
                photographerId: (w.photographer_id as string) ?? photographerId,
                projectStage: (w.stage as string) ?? null,
              },
            };
          }
          return {
            linkedProjectAtStart: true,
            identity: {
              weddingId: wid,
              photographerId,
              projectStage: null,
            },
          };
        }
        const base = await resolveDeterministicIdentity(supabaseAdmin, {
          sender: senderForIdentity,
          payloadPhotographerId: photographerId,
        });
        return { identity: base, linkedProjectAtStart: false };
      },
    );

    /** Layer 1: promo/bulk — disposition only, no LLM / workers. */
    if (!linkedProjectAtStart) {
      const pre = evaluatePreLlmInboundEmail({
        messageMetadata,
        senderRaw,
      });
      if (pre.kind === "automated_or_bulk") {
        const promoMeta = {
          routing_disposition: "promo_automated" as const,
          heuristic_reasons: pre.reasons,
          routing_layer: "header_heuristic_v1",
        };
        await step.run("persist-heuristic-promo", async () => {
          const { error } = await supabaseAdmin
            .from("threads")
            .update({ ai_routing_metadata: promoMeta as Record<string, unknown> })
            .eq("id", threadId)
            .eq("photographer_id", photographerId);
          if (error) throw new Error(error.message);
        });
        return {
          status: "heuristic_filtered" as const,
          threadId,
          heuristic_reasons: pre.reasons,
          traceId,
        };
      }
    }

    const llmIntent = await step.run("classify-intent", async () => {
      const raw = await runTriageAgent(body);
      if (linkedProjectAtStart || identity.weddingId) return raw;
      return applyUnlinkedWeddingLeadIntakeBoost(raw, body, threadRow.title as string | null);
    });

    const stageGateIntent = enforceStageGate(llmIntent, identity.projectStage, !!identity.weddingId);
    const matchmakerStageIntent = matchmakerStageIntentForGmailClassifier(llmIntent, identity);

    const boundedUnresolvedGateOn = isTriageBoundedUnresolvedEmailMatchmakerEnabled();
    const boundedUnresolvedSubsetEligible =
      source === "gmail_delta" &&
      boundedUnresolvedGateOn &&
      !identity.weddingId &&
      llmIntent !== "intake";

    const matchResult = await step.run(
      "conditional-matchmaker",
      async (): Promise<MatchmakerStepResult> =>
        runConditionalMatchmakerForEmail(supabaseAdmin, {
          body,
          identity,
          stageGateIntent: matchmakerStageIntent,
          boundedUnresolvedSubsetEligible,
          payloadPhotographerId: photographerId,
        }),
    );

    const derived = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult,
      payloadPhotographerId: photographerId,
      boundedUnresolvedSubsetEligible,
      derivePolicy: "gmail_canonical",
    });

    const {
      finalWeddingId,
      finalPhotographerId,
      matchCandidateId,
      matchConfidence,
      nearMatchForApproval,
      dispatchIntent,
      weddingResolutionTrace,
    } = derived;

    const matchSuggestionMeta = buildAiRoutingMetadataForUnresolved({
      finalWeddingId,
      matchResult,
      dispatchIntent,
      nearMatchForApproval,
    });

    const shouldRouteNonWeddingBusinessInquiry =
      !finalWeddingId &&
      !linkedProjectAtStart &&
      llmIntent !== "intake" &&
      !nearMatchForApproval &&
      !matchSuggestionMeta;

    const nonWeddingBusinessInquiryOutcome = await step.run(
      "route-non-wedding-business-inquiry",
      async () => {
        if (!shouldRouteNonWeddingBusinessInquiry || !finalPhotographerId) {
          return null;
        }
        return await routeNonWeddingBusinessInquiry(supabaseAdmin, {
          photographerId: finalPhotographerId,
          threadId,
          llmIntent,
          dispatchIntent,
          channel: "email",
          senderEmail: senderRaw || "",
          body,
        });
      },
    );

    const nonWeddingBusinessInquiryMeta = nonWeddingBusinessInquiryOutcome
      ? buildAiRoutingMetadataNonWeddingBusinessInquiry({
          llmIntent,
          dispatchIntent,
          policyDecision: nonWeddingBusinessInquiryOutcome.decision,
          matchedPlaybookRuleId: nonWeddingBusinessInquiryOutcome.matchedPlaybookRuleId,
          matchedPlaybookActionKey: nonWeddingBusinessInquiryOutcome.matchedPlaybookActionKey,
          reasonCode: nonWeddingBusinessInquiryOutcome.reasonCode,
          draftId: nonWeddingBusinessInquiryOutcome.draftId,
          escalationId: nonWeddingBusinessInquiryOutcome.escalationId,
        })
      : null;

    // Legacy label retained only when policy router did not run (e.g. missing photographer id).
    const legacyHumanNoRouteMeta =
      shouldRouteNonWeddingBusinessInquiry && !nonWeddingBusinessInquiryMeta
        ? buildAiRoutingMetadataUnlinkedHumanNoRoute({ llmIntent })
        : null;

    const routingMetadata =
      matchSuggestionMeta ?? nonWeddingBusinessInquiryMeta ?? legacyHumanNoRouteMeta;

    await step.run("persist-thread-routing", async () => {
      if (linkedProjectAtStart) {
        return;
      }
      if (finalWeddingId) {
        const { error } = await supabaseAdmin
          .from("threads")
          .update({ wedding_id: finalWeddingId, ai_routing_metadata: null })
          .eq("id", threadId)
          .eq("photographer_id", photographerId);
        if (error) throw new Error(error.message);
        return;
      }
      if (routingMetadata) {
        const { error } = await supabaseAdmin
          .from("threads")
          .update({
            ai_routing_metadata: routingMetadata as Record<string, unknown>,
          })
          .eq("id", threadId)
          .eq("photographer_id", photographerId);
        if (error) throw new Error(error.message);
      }
    });

    const nearMatchEscalationId = await step.run(
      "insert-near-match-escalation",
      async (): Promise<string | null> => {
        if (linkedProjectAtStart) {
          return null;
        }
        if (!nearMatchForApproval || !finalPhotographerId || !matchCandidateId) {
          return null;
        }
        return await insertBoundedUnresolvedMatchApprovalEscalation(supabaseAdmin, {
          photographerId: finalPhotographerId,
          threadId,
          candidateWeddingId: matchCandidateId,
          confidenceScore: matchConfidence,
          matchmakerReasoning: matchResult.match?.reasoning ?? "",
          llmIntent,
          senderEmail: senderRaw || "",
        });
      },
    );

    if (!linkedProjectAtStart && nearMatchForApproval && !nearMatchEscalationId) {
      throw new Error("Near-match escalation expected but insert returned null id.");
    }

    if (dispatchIntent !== "intake" && !finalWeddingId) {
      if (nonWeddingBusinessInquiryOutcome) {
        return {
          status: "non_wedding_business_inquiry_routed" as const,
          threadId,
          dispatchIntent,
          llmIntent,
          routingMetadata,
          non_wedding_business_inquiry: nonWeddingBusinessInquiryOutcome,
          wedding_resolution_trace: weddingResolutionTrace,
          traceId,
        };
      }
      return {
        status: "metadata_only" as const,
        threadId,
        dispatchIntent,
        llmIntent,
        routingMetadata,
        wedding_resolution_trace: weddingResolutionTrace,
        traceId,
      };
    }

    const bootstrapResult = await step.run("bootstrap-inquiry-from-thread", async () => {
      if (linkedProjectAtStart) {
        return null;
      }
      if (!(llmIntent === "intake" && !finalWeddingId && !nearMatchForApproval)) {
        return null;
      }
      return await bootstrapInquiryWeddingForCanonicalThread(supabaseAdmin, {
        photographerId,
        threadId,
        rawMessagePreview: body,
        senderEmail: senderRaw,
        threadTitle: threadRow.title as string | null,
      });
    });

    let effectiveWeddingId = finalWeddingId;
    let effectivePhotographerId = finalPhotographerId;
    if (bootstrapResult) {
      effectiveWeddingId = bootstrapResult.weddingId;
      effectivePhotographerId = photographerId;
    }

    const dispatchResult = await step.run(
      "dispatch-downstream",
      async (): Promise<MainPathEmailDispatchResult> =>
        runMainPathEmailDispatch({
          nearMatchForApproval,
          nearMatchEscalationId,
          dispatchIntent,
          finalWeddingId: effectiveWeddingId,
          finalPhotographerId: effectivePhotographerId,
          threadId,
          body,
          sender: senderRaw,
          replyChannel: "email",
          useExistingThreadIntakeEvent: dispatchIntent === "intake",
        }),
    );

    return {
      status: "routed" as const,
      threadId,
      dispatchIntent,
      dispatchResult,
      wedding_resolution_trace: weddingResolutionTrace,
      traceId,
    };
  },
);
