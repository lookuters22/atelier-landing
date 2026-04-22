/**
 * Line-buffered SSE reader for the Operator Ana `token` / `done` / `error` event contract.
 * No fetch, no Supabase, no React.
 */

const KNOWN = new Set<string>(["token", "done", "error"]);

export type OperatorAssistantSseEvent = {
  type: "token" | "done" | "error";
  data: unknown;
};

/**
 * Yields one parsed JSON payload per well-formed event block (blank line after fields).
 * Partial blocks that never receive a blank line, and malformed `data` JSON, are skipped.
 */
export async function* consumeOperatorAssistantSseStream(
  res: Response,
  signal: AbortSignal,
): AsyncGenerator<OperatorAssistantSseEvent, void, undefined> {
  if (!res.body) return;

  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8", { fatal: false });
  let lineCarry = "";
  let eventType = "";
  let dataBuffer = "";

  const onAbort = () => {
    void reader.cancel("aborted");
  };
  if (signal.aborted) {
    onAbort();
    return;
  }
  signal.addEventListener("abort", onAbort, { once: true });

  const parseField = (line: string): void => {
    if (line.length === 0) return;
    if (line[0] === ":") return;
    const c = line.indexOf(":");
    if (c < 0) return;
    const name = line.slice(0, c);
    const value = c + 1 < line.length && line[c + 1] === " " ? line.slice(c + 2) : line.slice(c + 1);
    if (name === "event") {
      eventType = value;
      return;
    }
    if (name === "data") {
      if (dataBuffer.length > 0) {
        dataBuffer += "\n";
      }
      dataBuffer += value;
    }
  };

  const emitBlankBlock = function* () {
    if (KNOWN.has(eventType) && dataBuffer.length > 0) {
      try {
        yield { type: eventType as "token" | "done" | "error", data: JSON.parse(dataBuffer) as unknown };
      } catch {
        // malformed
      }
    }
    eventType = "";
    dataBuffer = "";
  };

  const processOneLine = function* (line: string) {
    if (line.length === 0) {
      yield* emitBlankBlock();
    } else {
      parseField(line);
    }
  };

  const drainLineBuffer = function* (allowPartialTail: boolean) {
    for (;;) {
      const i = lineCarry.indexOf("\n");
      if (i < 0) {
        if (allowPartialTail && lineCarry.length > 0) {
          const line = lineCarry.endsWith("\r") ? lineCarry.slice(0, -1) : lineCarry;
          lineCarry = "";
          yield* processOneLine(line);
        }
        return;
      }
      const raw = lineCarry.slice(0, i);
      lineCarry = lineCarry.slice(i + 1);
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      yield* processOneLine(line);
    }
  };

  try {
    for (;;) {
      if (signal.aborted) {
        return;
      }
      const { done, value } = await reader.read();
      if (value && value.length > 0) {
        lineCarry += dec.decode(value, { stream: !done });
      }
      if (done) {
        lineCarry += dec.decode();
        yield* drainLineBuffer(true);
        return;
      }
      yield* drainLineBuffer(false);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
