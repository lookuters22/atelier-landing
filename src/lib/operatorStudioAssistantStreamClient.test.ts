import { describe, expect, it } from "vitest";
import { encodeSseEvent } from "../../supabase/functions/_shared/operatorStudioAssistant/operatorAssistantSseEncoder.ts";
import {
  consumeOperatorAssistantSseStream,
  type OperatorAssistantSseEvent,
} from "./operatorStudioAssistantStreamClient.ts";

const te = new TextEncoder();

function resFromString(s: string): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(te.encode(s));
        c.close();
      },
    }),
  );
}

function resFromChunksAsync(chunks: string[]): Response {
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (i < chunks.length) {
          c.enqueue(te.encode(chunks[i++]!));
        } else {
          c.close();
        }
      },
    }),
  );
}

async function collect(
  it: AsyncIterable<OperatorAssistantSseEvent>,
): Promise<OperatorAssistantSseEvent[]> {
  const o: OperatorAssistantSseEvent[] = [];
  for await (const e of it) {
    o.push(e);
  }
  return o;
}

describe("consumeOperatorAssistantSseStream", () => {
  it("1. single complete event", async () => {
    const u = encodeSseEvent("token", { delta: "a" });
    const r = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(u);
          c.close();
        },
      }),
    );
    const out = await collect(consumeOperatorAssistantSseStream(r, new AbortController().signal));
    expect(out).toEqual([{ type: "token", data: { delta: "a" } }]);
  });

  it("2. one event split across network chunks", async () => {
    const t = "event: done\ndata: {\"reply\":\"ok\"}\n\n";
    const r = resFromChunksAsync([t.slice(0, 5), t.slice(5, 12), t.slice(12)]);
    const out = await collect(consumeOperatorAssistantSseStream(r, new AbortController().signal));
    expect(out).toEqual([{ type: "done", data: { reply: "ok" } }]);
  });

  it("3. multiple sequential events", async () => {
    const a = encodeSseEvent("token", { delta: "1" });
    const b = encodeSseEvent("token", { delta: "2" });
    const r = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(a);
          c.enqueue(b);
          c.close();
        },
      }),
    );
    const out = await collect(consumeOperatorAssistantSseStream(r, new AbortController().signal));
    expect(out).toEqual([
      { type: "token", data: { delta: "1" } },
      { type: "token", data: { delta: "2" } },
    ]);
  });

  it("4. token then done ordering", async () => {
    const t = new TextDecoder().decode(encodeSseEvent("token", { delta: "x" }));
    const d = new TextDecoder().decode(encodeSseEvent("done", { reply: "full" }));
    const r = resFromString(t + d);
    const out = await collect(consumeOperatorAssistantSseStream(r, new AbortController().signal));
    expect(out).toEqual([
      { type: "token", data: { delta: "x" } },
      { type: "done", data: { reply: "full" } },
    ]);
  });

  it("5. abort mid-stream", async () => {
    const first = "event: token\ndata: {\"delta\":\"a\"}\n\nevent: tok";
    const ac = new AbortController();
    const r = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(te.encode(first));
        },
      }),
    );
    const gen = consumeOperatorAssistantSseStream(r, ac.signal);
    const a = await gen.next();
    expect(a.value).toEqual({ type: "token", data: { delta: "a" } });
    ac.abort();
    const b = await gen.next();
    expect(b.done).toBe(true);
  });

  it("6. malformed or incomplete trailing data ignored", async () => {
    const r = resFromString(
      'event: token\ndata: {"delta":"ok"}\n\n' +
        "garbage line without field\n" +
        "event: error\ndata: not-json\n\n" +
        "incomplete: no closing blank line; trailing fragment",
    );
    const out = await collect(consumeOperatorAssistantSseStream(r, new AbortController().signal));
    expect(out).toEqual([{ type: "token", data: { delta: "ok" } }]);
  });
});
