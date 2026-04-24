/**
 * Structured observability for post-ingest Gmail/thread downstream dispatch (`processInboxThreadRequiresTriage`).
 * Pure builders only — no routing.
 */
import type { TriageIntent } from "../agents/triage.ts";
import type { MainPathEmailDispatchResult } from "./postIngestThreadDispatch.ts";

export type PostIngestDispatchObservabilityRecord = {
  event: "post_ingest_dispatch_v1";
  threadId: string;
  photographerId: string;
  dispatchIntent: TriageIntent;
  replyChannel: "email" | "web";
  resultKind: MainPathEmailDispatchResult["kind"];
  traceId?: string;
  /** `ai/intent.*` event name when `resultKind === "legacy"`. */
  legacyEvent?: string;
  /** Bounded-unresolved near-match escalation row id. */
  escalationId?: string;
  /** CUT4–CUT8 live orchestrator fan-out correlation id (exactly one set for `cut*_live`). */
  orchestratorLiveCorrelationId?: string;
  /** CUT D1 policy blocked dispatch (no legacy, no orchestrator). */
  blocked?: boolean;
};

export type BuildPostIngestDispatchObservabilityInput = {
  threadId: string;
  photographerId: string;
  dispatchIntent: TriageIntent;
  replyChannel: "email" | "web";
  dispatchResult: MainPathEmailDispatchResult;
  traceId?: string | null;
};

export function buildPostIngestDispatchObservabilityRecord(
  input: BuildPostIngestDispatchObservabilityInput,
): PostIngestDispatchObservabilityRecord {
  const traceTrim =
    input.traceId != null && String(input.traceId).trim() !== ""
      ? String(input.traceId).trim()
      : undefined;

  const r = input.dispatchResult;
  const common: Pick<
    PostIngestDispatchObservabilityRecord,
    | "event"
    | "threadId"
    | "photographerId"
    | "dispatchIntent"
    | "replyChannel"
    | "resultKind"
  > &
    Partial<Pick<PostIngestDispatchObservabilityRecord, "traceId">> = {
    event: "post_ingest_dispatch_v1",
    threadId: input.threadId,
    photographerId: input.photographerId,
    dispatchIntent: input.dispatchIntent,
    replyChannel: input.replyChannel,
    resultKind: r.kind,
    ...(traceTrim !== undefined ? { traceId: traceTrim } : {}),
  };

  switch (r.kind) {
    case "legacy":
      return { ...common, legacyEvent: String(r.legacyEvent) };
    case "near_match_approval_escalation":
      return { ...common, escalationId: r.escalationId };
    case "intake":
      return { ...common };
    case "cut4_live":
      return { ...common, orchestratorLiveCorrelationId: r.cut4LiveCorrelationId };
    case "cut5_live":
      return { ...common, orchestratorLiveCorrelationId: r.cut5LiveCorrelationId };
    case "cut6_live":
      return { ...common, orchestratorLiveCorrelationId: r.cut6LiveCorrelationId };
    case "cut7_live":
      return { ...common, orchestratorLiveCorrelationId: r.cut7LiveCorrelationId };
    case "cut8_live":
      return { ...common, orchestratorLiveCorrelationId: r.cut8LiveCorrelationId };
    case "cut4_d1_blocked_no_dispatch":
    case "cut5_d1_blocked_no_dispatch":
    case "cut6_d1_blocked_no_dispatch":
    case "cut7_d1_blocked_no_dispatch":
    case "cut8_d1_blocked_no_dispatch":
      return { ...common, blocked: true };
    default: {
      const _exhaustive: never = r;
      return _exhaustive;
    }
  }
}

export function logPostIngestDispatchObservabilityRecord(record: PostIngestDispatchObservabilityRecord): void {
  console.info("[processInboxThreadRequiresTriage.dispatch_result]", JSON.stringify(record));
}
