/* Deno env shim (Vitest in Node) — see completeOperatorStudioAssistantLlm.test.ts */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, vi, beforeEach } from "vitest";

const handleStreamingMock = vi.hoisted(() => vi.fn());

vi.mock("./handleOperatorStudioAssistantPost.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./handleOperatorStudioAssistantPost.ts")>();
  return { ...mod, handleOperatorStudioAssistantPostStreaming: handleStreamingMock };
});

import {
  createOperatorStudioAssistantSseResponse,
  parseSseTextForTests,
  requestWantsSseEventStream,
  shouldUseOperatorStudioAssistantSse,
} from "./operatorStudioAssistantSseResponse.ts";
import type { OperatorStudioAssistantRequestBody, OperatorStudioAssistantValidatedRequest } from "./handleOperatorStudioAssistantPost.ts";

function req(accept: string | null) {
  return new Request("https://x/", { headers: accept != null ? { Accept: accept } : {} });
}

describe("operatorStudioAssistantSseResponse (Slice 4)", () => {
  beforeEach(() => {
    handleStreamingMock.mockReset();
  });

  it("negotiation: flag off or missing => shouldUse is false", () => {
    expect(shouldUseOperatorStudioAssistantSse(req("text/event-stream"), () => undefined)).toBe(false);
    expect(shouldUseOperatorStudioAssistantSse(req("text/event-stream"), () => "false")).toBe(false);
  });

  it("negotiation: flag on but no Accept => legacy path (not SSE)", () => {
    expect(shouldUseOperatorStudioAssistantSse(req(null), () => "true")).toBe(false);
    expect(shouldUseOperatorStudioAssistantSse(req("application/json"), () => "true")).toBe(false);
  });

  it("negotiation: flag on + text/event-stream => SSE", () => {
    expect(shouldUseOperatorStudioAssistantSse(req("text/event-stream"), () => "true")).toBe(true);
    expect(shouldUseOperatorStudioAssistantSse(req("application/json, text/event-stream"), () => "true")).toBe(
      true,
    );
  });

  it("requestWantsSseEventStream: case-insensitive", () => {
    expect(requestWantsSseEventStream(req("Text/Event-Stream"))).toBe(true);
  });

  it("successful stream: text/event-stream, token then done", async () => {
    handleStreamingMock.mockImplementation(async (_s, _p, _b, onToken) => {
      onToken("a");
      onToken("b");
      return {
        reply: "ab",
        clientFacingForbidden: true,
        proposedActions: undefined,
        retrievalLog: { mocked: true },
        carryForward: null,
      } as never;
    });

    const requestBody: OperatorStudioAssistantRequestBody = { queryText: "q" };
    const prevalidated: OperatorStudioAssistantValidatedRequest = { queryText: "q", conversation: [] };
    const res = createOperatorStudioAssistantSseResponse(
      {} as never,
      "photo-1",
      requestBody,
      prevalidated,
      new AbortController().signal,
      { "Access-Control-Allow-Origin": "*" },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const raw = await new Response(res.body).text();
    const events = await parseSseTextForTests(raw);
    expect(events.map((e) => e.event)).toEqual(["token", "token", "done"]);
    expect((events[0]!.data as { delta: string }).delta).toBe("a");
    expect((events[1]!.data as { delta: string }).delta).toBe("b");
    expect((events[2]!.data as { reply: string }).reply).toBe("ab");
  });

  it("error stream: one error event, no done", async () => {
    handleStreamingMock.mockRejectedValue(new Error("llm_boom"));
    const res = createOperatorStudioAssistantSseResponse(
      {} as never,
      "photo-1",
      { queryText: "q" },
      { queryText: "q", conversation: [] },
      new AbortController().signal,
      {},
    );
    const raw = await new Response(res.body).text();
    const events = await parseSseTextForTests(raw);
    expect(events.map((e) => e.event)).toEqual(["error"]);
    expect((events[0]!.data as { message: string }).message).toContain("llm_boom");
  });
});
