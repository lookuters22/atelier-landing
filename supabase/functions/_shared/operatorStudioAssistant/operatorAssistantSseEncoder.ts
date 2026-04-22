/**
 * Server-side helpers for the Operator Ana text/event-stream contract.
 * @see V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md
 */

const te = new TextEncoder();

/**
 * Produces a single UTF-8 SSE event block: `event:` + one or more `data:` lines + blank line.
 * If `JSON.stringify` output contains newlines, it is split per HTML SSE rules so framing stays valid.
 */
export function encodeSseEvent(
  event: "token" | "done" | "error",
  data: unknown,
): Uint8Array {
  const json = JSON.stringify(data);
  const lines: string[] = ["event: " + event + "\n"];
  if (json.indexOf("\n") === -1) {
    lines.push("data: " + json + "\n");
  } else {
    for (const part of json.split("\n")) {
      lines.push("data: " + part + "\n");
    }
  }
  lines.push("\n");
  return te.encode(lines.join(""));
}
