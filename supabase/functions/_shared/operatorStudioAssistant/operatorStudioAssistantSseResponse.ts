/**
 * Edge SSE transport for operator Ana (Slice 4) — `text/event-stream` body only; negotiation lives in the function entry.
 * @see V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encodeSseEvent } from "./operatorAssistantSseEncoder.ts";
import {
  type OperatorStudioAssistantRequestBody,
  type OperatorStudioAssistantValidatedRequest,
  handleOperatorStudioAssistantPostStreaming,
} from "./handleOperatorStudioAssistantPost.ts";

function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
  try {
    controller.enqueue(chunk);
  } catch {
    /* client disconnected */
  }
}

function briefErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 200 ? m.slice(0, 200) : m;
}

export function requestWantsSseEventStream(req: Request): boolean {
  return (req.headers.get("Accept") ?? "").toLowerCase().includes("text/event-stream");
}

/**
 * `OPERATOR_ASSISTANT_STREAMING_V1` must be exactly `"true"`. Optional `getEnv` for tests.
 */
export function isOperatorStudioAssistantSseV1Enabled(
  getEnv: (key: string) => string | undefined = (k) => Deno.env.get(k),
): boolean {
  return getEnv("OPERATOR_ASSISTANT_STREAMING_V1") === "true";
}

/** Both server flag and `Accept: text/event-stream` (case-insensitive substring match) must hold. */
export function shouldUseOperatorStudioAssistantSse(
  req: Request,
  getEnv: (key: string) => string | undefined = (k) => Deno.env.get(k),
): boolean {
  return isOperatorStudioAssistantSseV1Enabled(getEnv) && requestWantsSseEventStream(req);
}

/**
 * `200` response with CORS, SSE headers, and a `ReadableStream` of `token` / `done` or `error` events.
 */
export function createOperatorStudioAssistantSseResponse(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
  prevalidated: OperatorStudioAssistantValidatedRequest,
  signal: AbortSignal,
  corsHeaders: Record<string, string>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          const result = await handleOperatorStudioAssistantPostStreaming(
            supabase,
            photographerId,
            body,
            (delta) => {
              safeEnqueue(controller, encodeSseEvent("token", { delta }));
            },
            { signal, prevalidated },
          );
          safeEnqueue(controller, encodeSseEvent("done", result as unknown as Record<string, unknown>));
        } catch (e) {
          safeEnqueue(controller, encodeSseEvent("error", { message: briefErrorMessage(e) }));
        } finally {
          try {
            controller.close();
          } catch {
            /* */
          }
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Parse raw SSE from a `Response` body (tests / lightweight inspection). */
export async function parseSseTextForTests(raw: string): Promise<
  Array<{ event: "token" | "done" | "error"; data: unknown }>
> {
  const out: Array<{ event: "token" | "done" | "error"; data: unknown }> = [];
  let currentEvent: "token" | "done" | "error" | null = null;
  let dataLines: string[] = [];
  const flush = () => {
    if (currentEvent == null || dataLines.length === 0) {
      dataLines = [];
      return;
    }
    const joined = dataLines.join("\n");
    dataLines = [];
    try {
      out.push({ event: currentEvent, data: JSON.parse(joined) });
    } catch {
      out.push({ event: currentEvent, data: joined });
    }
    currentEvent = null;
  };
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      const ev = line.slice(6).trim() as "token" | "done" | "error";
      if (ev === "token" || ev === "done" || ev === "error") {
        currentEvent = ev;
      }
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    } else if (line === "") {
      flush();
    }
  }
  flush();
  return out;
}
