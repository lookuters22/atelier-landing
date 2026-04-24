/**
 * Post–Gmail-ingest canonical thread dispatch: legacy `ai/intent.*`, existing-thread intake, or CUT4–CUT8 orchestrator.
 * Shared implementation for the live inbox-thread classifier; legacy pre-ingest callers use {@link runMainPathEmailDispatch}
 * in `runMainPathEmailDispatch.ts`.
 */
import type { TriageIntent } from "../agents/triage.ts";
import {
  AI_INTENT_INTAKE_EXISTING_THREAD_V1_EVENT,
  AI_INTENT_INTAKE_EXISTING_THREAD_V1_SCHEMA_VERSION,
  inngest,
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
  type AtelierEvents,
} from "../inngest.ts";
import {
  isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed,
  isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed,
  isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed,
  isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed,
  isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed,
  isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled,
} from "../orchestrator/triageShadowOrchestratorClientV1Gate.ts";

export function orchestratorInboundSenderFields(sender: string): { inboundSenderEmail?: string } {
  const t = sender.trim();
  if (!t.includes("@")) return {};
  return { inboundSenderEmail: t };
}

const INTENT_EVENT_MAP: Record<TriageIntent, keyof AtelierEvents> = {
  intake: "ai/intent.intake",
  commercial: "ai/intent.commercial",
  logistics: "ai/intent.logistics",
  project_management: "ai/intent.project_management",
  concierge: "ai/intent.concierge",
  studio: "ai/intent.studio",
};

export type MainPathEmailDispatchResult =
  | { kind: "near_match_approval_escalation"; escalationId: string }
  | { kind: "intake" }
  | { kind: "cut4_d1_blocked_no_dispatch" }
  | { kind: "cut4_live"; cut4LiveCorrelationId: string }
  | { kind: "cut5_d1_blocked_no_dispatch" }
  | { kind: "cut5_live"; cut5LiveCorrelationId: string }
  | { kind: "cut6_d1_blocked_no_dispatch" }
  | { kind: "cut6_live"; cut6LiveCorrelationId: string }
  | { kind: "cut7_d1_blocked_no_dispatch" }
  | { kind: "cut7_live"; cut7LiveCorrelationId: string }
  | { kind: "cut8_d1_blocked_no_dispatch" }
  | { kind: "cut8_live"; cut8LiveCorrelationId: string }
  | { kind: "legacy"; legacyEvent: keyof AtelierEvents };

export async function runPostIngestThreadDispatch(input: {
  nearMatchForApproval: boolean;
  nearMatchEscalationId: string | null;
  dispatchIntent: TriageIntent;
  finalWeddingId: string | null;
  finalPhotographerId: string | null;
  threadId: string;
  body: string;
  sender: string;
  replyChannel: "email" | "web";
  /** Gmail/canonical thread: never send legacy `ai/intent.intake` (duplicate lead rows). */
  useExistingThreadIntakeEvent?: boolean;
}): Promise<MainPathEmailDispatchResult> {
  const {
    nearMatchForApproval,
    nearMatchEscalationId,
    dispatchIntent,
    finalWeddingId,
    finalPhotographerId,
    threadId,
    body,
    sender,
    replyChannel,
    useExistingThreadIntakeEvent,
  } = input;

  if (nearMatchForApproval && nearMatchEscalationId) {
    return { kind: "near_match_approval_escalation", escalationId: nearMatchEscalationId };
  }

  const eventName = INTENT_EVENT_MAP[dispatchIntent];

  const cut4MainPathLive =
    isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled() &&
    dispatchIntent === "concierge" &&
    !!finalWeddingId;

  const cut5MainPathLive =
    isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled() &&
    dispatchIntent === "project_management" &&
    !!finalWeddingId;

  const cut6MainPathLive =
    isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled() &&
    dispatchIntent === "logistics" &&
    !!finalWeddingId;

  const cut7MainPathLive =
    isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled() &&
    dispatchIntent === "commercial" &&
    !!finalWeddingId;

  const cut8MainPathLive =
    isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled() &&
    dispatchIntent === "studio" &&
    !!finalWeddingId;

  if (eventName === "ai/intent.intake") {
    if (useExistingThreadIntakeEvent) {
      if (!finalWeddingId || !finalPhotographerId) {
        throw new Error("runMainPathEmailDispatch: existing-thread intake requires wedding + photographer.");
      }
      await inngest.send({
        name: AI_INTENT_INTAKE_EXISTING_THREAD_V1_EVENT,
        data: {
          schemaVersion: AI_INTENT_INTAKE_EXISTING_THREAD_V1_SCHEMA_VERSION,
          photographerId: finalPhotographerId,
          weddingId: finalWeddingId,
          threadId,
          raw_message: body,
          sender_email: sender,
          reply_channel: replyChannel,
        },
      });
    } else {
      await inngest.send({
        name: "ai/intent.intake",
        data: {
          photographer_id: finalPhotographerId ?? "",
          wedding_id: finalWeddingId ?? undefined,
          thread_id: threadId,
          raw_message: body,
          sender_email: sender,
          reply_channel: replyChannel,
        },
      });
    }
    return { kind: "intake" };
  }

  if (!finalPhotographerId) {
    throw new Error("dispatch: missing photographer_id for legacy ai/intent.* (tenant-proof required).");
  }

  const orchReply = replyChannel === "web" ? "web" : "email";

  if (cut4MainPathLive) {
    const cut4LiveCorrelationId = crypto.randomUUID();
    await inngest.send({
      name: ORCHESTRATOR_CLIENT_V1_EVENT,
      data: {
        schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
        photographerId: finalPhotographerId,
        weddingId: finalWeddingId!,
        threadId,
        replyChannel: orchReply,
        rawMessage: body,
        ...orchestratorInboundSenderFields(sender),
        requestedExecutionMode: "draft_only",
        cut4LiveCorrelationId,
        cut4LiveFanoutSource: "triage_main_concierge_live" as const,
      },
    });
    return { kind: "cut4_live", cut4LiveCorrelationId };
  }

  if (
    dispatchIntent === "concierge" &&
    !!finalWeddingId &&
    !cut4MainPathLive &&
    !isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed()
  ) {
    return { kind: "cut4_d1_blocked_no_dispatch" as const };
  }

  if (cut5MainPathLive) {
    const cut5LiveCorrelationId = crypto.randomUUID();
    await inngest.send({
      name: ORCHESTRATOR_CLIENT_V1_EVENT,
      data: {
        schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
        photographerId: finalPhotographerId,
        weddingId: finalWeddingId!,
        threadId,
        replyChannel: orchReply,
        rawMessage: body,
        ...orchestratorInboundSenderFields(sender),
        requestedExecutionMode: "draft_only",
        cut5LiveCorrelationId,
        cut5LiveFanoutSource: "triage_main_project_management_live" as const,
      },
    });
    return { kind: "cut5_live", cut5LiveCorrelationId };
  }

  if (
    dispatchIntent === "project_management" &&
    !!finalWeddingId &&
    !cut5MainPathLive &&
    !isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed()
  ) {
    return { kind: "cut5_d1_blocked_no_dispatch" as const };
  }

  if (cut6MainPathLive) {
    const cut6LiveCorrelationId = crypto.randomUUID();
    await inngest.send({
      name: ORCHESTRATOR_CLIENT_V1_EVENT,
      data: {
        schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
        photographerId: finalPhotographerId,
        weddingId: finalWeddingId!,
        threadId,
        replyChannel: orchReply,
        rawMessage: body,
        ...orchestratorInboundSenderFields(sender),
        requestedExecutionMode: "draft_only",
        cut6LiveCorrelationId,
        cut6LiveFanoutSource: "triage_main_logistics_live" as const,
      },
    });
    return { kind: "cut6_live", cut6LiveCorrelationId };
  }

  if (
    dispatchIntent === "logistics" &&
    !!finalWeddingId &&
    !cut6MainPathLive &&
    !isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed()
  ) {
    return { kind: "cut6_d1_blocked_no_dispatch" as const };
  }

  if (cut7MainPathLive) {
    const cut7LiveCorrelationId = crypto.randomUUID();
    await inngest.send({
      name: ORCHESTRATOR_CLIENT_V1_EVENT,
      data: {
        schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
        photographerId: finalPhotographerId,
        weddingId: finalWeddingId!,
        threadId,
        replyChannel: orchReply,
        rawMessage: body,
        ...orchestratorInboundSenderFields(sender),
        requestedExecutionMode: "draft_only",
        cut7LiveCorrelationId,
        cut7LiveFanoutSource: "triage_main_commercial_live" as const,
      },
    });
    return { kind: "cut7_live", cut7LiveCorrelationId };
  }

  if (
    dispatchIntent === "commercial" &&
    !!finalWeddingId &&
    !cut7MainPathLive &&
    !isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed()
  ) {
    return { kind: "cut7_d1_blocked_no_dispatch" as const };
  }

  if (cut8MainPathLive) {
    const cut8LiveCorrelationId = crypto.randomUUID();
    await inngest.send({
      name: ORCHESTRATOR_CLIENT_V1_EVENT,
      data: {
        schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
        photographerId: finalPhotographerId,
        weddingId: finalWeddingId!,
        threadId,
        replyChannel: orchReply,
        rawMessage: body,
        ...orchestratorInboundSenderFields(sender),
        requestedExecutionMode: "draft_only",
        cut8LiveCorrelationId,
        cut8LiveFanoutSource: "triage_main_studio_live" as const,
      },
    });
    return { kind: "cut8_live", cut8LiveCorrelationId };
  }

  if (
    dispatchIntent === "studio" &&
    !!finalWeddingId &&
    !cut8MainPathLive &&
    !isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed()
  ) {
    return { kind: "cut8_d1_blocked_no_dispatch" as const };
  }

  await inngest.send({
    name: eventName,
    data: {
      wedding_id: finalWeddingId!,
      photographer_id: finalPhotographerId,
      raw_message: body,
      reply_channel: replyChannel,
    },
  });
  return { kind: "legacy", legacyEvent: eventName };
}
