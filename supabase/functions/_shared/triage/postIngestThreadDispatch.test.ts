import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, gate } = vi.hoisted(() => {
  const send = vi.fn().mockResolvedValue(undefined);
  return {
    sendMock: send,
    gate: {
      live4: vi.fn(() => false),
      live5: vi.fn(() => false),
      live6: vi.fn(() => false),
      live7: vi.fn(() => false),
      live8: vi.fn(() => false),
      legacy4: vi.fn(() => true),
      legacy5: vi.fn(() => true),
      legacy6: vi.fn(() => true),
      legacy7: vi.fn(() => true),
      legacy8: vi.fn(() => true),
    },
  };
});

vi.mock("../inngest.ts", () => ({
  inngest: { send: sendMock },
  AI_INTENT_INTAKE_EXISTING_THREAD_V1_EVENT: "ai/intent.intake.existing_thread.v1",
  AI_INTENT_INTAKE_EXISTING_THREAD_V1_SCHEMA_VERSION: 1,
  ORCHESTRATOR_CLIENT_V1_EVENT: "ai/orchestrator.client.v1",
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION: 1,
}));

vi.mock("../orchestrator/triageShadowOrchestratorClientV1Gate.ts", () => ({
  isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled: () => gate.live4(),
  isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled: () => gate.live5(),
  isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled: () => gate.live6(),
  isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled: () => gate.live7(),
  isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled: () => gate.live8(),
  isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed: () => gate.legacy4(),
  isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed: () => gate.legacy5(),
  isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed: () => gate.legacy6(),
  isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed: () => gate.legacy7(),
  isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed: () => gate.legacy8(),
}));

import { runMainPathEmailDispatch } from "./runMainPathEmailDispatch.ts";
import { runPostIngestThreadDispatch } from "./postIngestThreadDispatch.ts";

const baseInput = {
  nearMatchForApproval: false as const,
  nearMatchEscalationId: null as string | null,
  threadId: "thread-1",
  body: "hello",
  sender: "client@example.com",
  replyChannel: "email" as const,
};

describe("runPostIngestThreadDispatch", () => {
  beforeEach(() => {
    sendMock.mockClear();
    gate.live4.mockReturnValue(false);
    gate.live5.mockReturnValue(false);
    gate.live6.mockReturnValue(false);
    gate.live7.mockReturnValue(false);
    gate.live8.mockReturnValue(false);
    gate.legacy4.mockReturnValue(true);
    gate.legacy5.mockReturnValue(true);
    gate.legacy6.mockReturnValue(true);
    gate.legacy7.mockReturnValue(true);
    gate.legacy8.mockReturnValue(true);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-0000000000c4" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("existing-thread intake emits versioned intake event", async () => {
    const r = await runPostIngestThreadDispatch({
      ...baseInput,
      dispatchIntent: "intake",
      finalWeddingId: "wed-1",
      finalPhotographerId: "photo-1",
      useExistingThreadIntakeEvent: true,
    });
    expect(r).toEqual({ kind: "intake" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toEqual({
      name: "ai/intent.intake.existing_thread.v1",
      data: {
        schemaVersion: 1,
        photographerId: "photo-1",
        weddingId: "wed-1",
        threadId: "thread-1",
        raw_message: "hello",
        sender_email: "client@example.com",
        reply_channel: "email",
      },
    });
  });

  it("legacy concierge when no known wedding and CUT4 live off", async () => {
    const r = await runPostIngestThreadDispatch({
      ...baseInput,
      dispatchIntent: "concierge",
      finalWeddingId: null,
      finalPhotographerId: "photo-1",
    });
    expect(r).toEqual({ kind: "legacy", legacyEvent: "ai/intent.concierge" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toEqual({
      name: "ai/intent.concierge",
      data: {
        wedding_id: null,
        photographer_id: "photo-1",
        raw_message: "hello",
        reply_channel: "email",
      },
    });
  });

  it("CUT4 live emits orchestrator client v1 with correlation id", async () => {
    gate.live4.mockReturnValue(true);
    const r = await runPostIngestThreadDispatch({
      ...baseInput,
      dispatchIntent: "concierge",
      finalWeddingId: "wed-1",
      finalPhotographerId: "photo-1",
    });
    expect(r).toEqual({
      kind: "cut4_live",
      cut4LiveCorrelationId: "00000000-0000-4000-8000-0000000000c4",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]?.[0] as { name: string; data: Record<string, unknown> };
    expect(payload.name).toBe("ai/orchestrator.client.v1");
    expect(payload.data).toMatchObject({
      schemaVersion: 1,
      photographerId: "photo-1",
      weddingId: "wed-1",
      threadId: "thread-1",
      replyChannel: "email",
      rawMessage: "hello",
      inboundSenderEmail: "client@example.com",
      requestedExecutionMode: "draft_only",
      cut4LiveCorrelationId: "00000000-0000-4000-8000-0000000000c4",
      cut4LiveFanoutSource: "triage_main_concierge_live",
    });
  });

  it("CUT4 D1 blocked: no dispatch when live off and legacy fallback disallowed", async () => {
    gate.legacy4.mockReturnValue(false);
    const r = await runPostIngestThreadDispatch({
      ...baseInput,
      dispatchIntent: "concierge",
      finalWeddingId: "wed-1",
      finalPhotographerId: "photo-1",
    });
    expect(r).toEqual({ kind: "cut4_d1_blocked_no_dispatch" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("runMainPathEmailDispatch wrapper", () => {
  beforeEach(() => {
    sendMock.mockClear();
    gate.live4.mockReturnValue(false);
    gate.live5.mockReturnValue(false);
    gate.live6.mockReturnValue(false);
    gate.live7.mockReturnValue(false);
    gate.live8.mockReturnValue(false);
    gate.legacy4.mockReturnValue(true);
    gate.legacy5.mockReturnValue(true);
    gate.legacy6.mockReturnValue(true);
    gate.legacy7.mockReturnValue(true);
    gate.legacy8.mockReturnValue(true);
  });

  it("delegates to the post-ingest implementation", async () => {
    const r = await runMainPathEmailDispatch({
      ...baseInput,
      dispatchIntent: "concierge",
      finalWeddingId: null,
      finalPhotographerId: "photo-1",
    });
    expect(r).toEqual({ kind: "legacy", legacyEvent: "ai/intent.concierge" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
