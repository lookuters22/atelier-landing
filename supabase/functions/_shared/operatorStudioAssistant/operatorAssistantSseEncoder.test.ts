import { describe, expect, it, vi } from "vitest";
import { encodeSseEvent } from "./operatorAssistantSseEncoder.ts";

const dec = new TextDecoder();

function asText(u: Uint8Array): string {
  return dec.decode(u);
}

describe("encodeSseEvent", () => {
  it("1. token event", () => {
    const u = encodeSseEvent("token", { delta: "hi" });
    expect(asText(u)).toBe('event: token\ndata: {"delta":"hi"}\n\n');
  });

  it("2. done event", () => {
    const payload = { reply: "x", clientFacingForbidden: true };
    const u = encodeSseEvent("done", payload);
    expect(asText(u)).toBe('event: done\ndata: {"reply":"x","clientFacingForbidden":true}\n\n');
  });

  it("3. error event", () => {
    const u = encodeSseEvent("error", { message: "bad" });
    expect(asText(u)).toBe('event: error\ndata: {"message":"bad"}\n\n');
  });

  it("4. multi-line JSON payload", () => {
    const sp = vi.spyOn(JSON, "stringify");
    const obj = { a: 1, nested: { b: 2 } };
    const pretty = JSON.stringify(obj, null, 2);
    expect(pretty).toContain("\n");
    sp.mockReturnValueOnce(pretty);
    const u = encodeSseEvent("done", obj);
    const t = asText(u);
    sp.mockRestore();
    expect(t.startsWith("event: done\n")).toBe(true);
    expect(t.endsWith("\n\n")).toBe(true);
    for (const line of pretty.split("\n")) {
      expect(t).toContain("data: " + line);
    }
    const lines: string[] = [];
    for (const row of t.split("\n")) {
      if (row.startsWith("data: ")) {
        lines.push(row.slice(6));
      }
    }
    const merged = lines.join("\n");
    expect(JSON.parse(merged)).toEqual(obj);
  });

  it("5. unicode payload", () => {
    const u = encodeSseEvent("token", { delta: "€" });
    expect(u).toBeInstanceOf(Uint8Array);
    const t = asText(u);
    expect(t).toContain("€");
    const round = JSON.parse(
      t.split("\n").find((l) => l.startsWith("data: "))!.slice(6).trim() || "{}",
    ) as { delta: string };
    expect(round.delta).toBe("€");
  });
});
