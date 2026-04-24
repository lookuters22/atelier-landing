/**
 * Structured observability for intake post-bootstrap downstream (`processIntakeExistingThread`).
 * Pure builders only — no routing or gate semantics.
 */

export type IntakePostBootstrapDownstreamChoice =
  | "live_orchestrator_email"
  | "live_orchestrator_web"
  | "shadow_orchestrator_parity"
  | "legacy_persona";

export type IntakePostBootstrapDispatchObservabilityRecord = {
  event: "intake_post_bootstrap_dispatch_v1";
  photographerId: string;
  weddingId: string;
  threadId: string;
  /** Ingress `reply_channel` (normalized string for logs). */
  replyChannel: string;
  downstreamChoice: IntakePostBootstrapDownstreamChoice;
  intakeLiveCorrelationId?: string;
  intakeLiveWebCorrelationId?: string;
  intakeParityCorrelationId?: string;
};

export type BuildIntakePostBootstrapDispatchObservabilityInput =
  | {
      photographerId: string;
      weddingId: string;
      threadId: string;
      replyChannel: string | undefined;
      downstreamChoice: "live_orchestrator_email";
      intakeLiveCorrelationId: string;
    }
  | {
      photographerId: string;
      weddingId: string;
      threadId: string;
      replyChannel: string | undefined;
      downstreamChoice: "live_orchestrator_web";
      intakeLiveWebCorrelationId: string;
    }
  | {
      photographerId: string;
      weddingId: string;
      threadId: string;
      replyChannel: string | undefined;
      downstreamChoice: "shadow_orchestrator_parity";
      intakeParityCorrelationId: string;
    }
  | {
      photographerId: string;
      weddingId: string;
      threadId: string;
      replyChannel: string | undefined;
      downstreamChoice: "legacy_persona";
    };

function normalizeReplyChannel(value: string | undefined): string {
  if (value == null || String(value).trim() === "") return "unspecified";
  return String(value).trim();
}

function normalizeId(value: string): string {
  return String(value).trim();
}

export function buildIntakePostBootstrapDispatchObservabilityRecord(
  input: BuildIntakePostBootstrapDispatchObservabilityInput,
): IntakePostBootstrapDispatchObservabilityRecord {
  const replyChannel = normalizeReplyChannel(input.replyChannel);
  const base = {
    event: "intake_post_bootstrap_dispatch_v1" as const,
    photographerId: normalizeId(input.photographerId),
    weddingId: normalizeId(input.weddingId),
    threadId: normalizeId(input.threadId),
    replyChannel,
    downstreamChoice: input.downstreamChoice,
  };

  switch (input.downstreamChoice) {
    case "live_orchestrator_email":
      return { ...base, intakeLiveCorrelationId: input.intakeLiveCorrelationId };
    case "live_orchestrator_web":
      return { ...base, intakeLiveWebCorrelationId: input.intakeLiveWebCorrelationId };
    case "shadow_orchestrator_parity":
      return { ...base, intakeParityCorrelationId: input.intakeParityCorrelationId };
    case "legacy_persona":
      return { ...base };
    default: {
      const _exhaustive: never = input.downstreamChoice;
      return _exhaustive;
    }
  }
}

export function logIntakePostBootstrapDispatchObservabilityRecord(
  record: IntakePostBootstrapDispatchObservabilityRecord,
): void {
  console.info("[processIntakeExistingThread.dispatch_result]", JSON.stringify(record));
}
