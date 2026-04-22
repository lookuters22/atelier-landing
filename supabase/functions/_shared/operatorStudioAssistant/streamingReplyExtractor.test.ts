import { describe, expect, it } from "vitest";
import { createReplyExtractor } from "./streamingReplyExtractor.ts";

function runChunks(chunks: string[]) {
  const ex = createReplyExtractor();
  const deltas: string[] = [];
  for (const ch of chunks) {
    const { deltaText, finished } = ex.feed(ch);
    if (deltaText) deltas.push(deltaText);
    if (finished) {
      return { ex, text: deltas.join(""), finished, state: ex.state() };
    }
  }
  return { ex, text: deltas.join(""), finished: false, state: ex.state() };
}

describe("createReplyExtractor — JSON mode", () => {
  it("1. reply is first field in JSON", () => {
    const json = '{"reply":"Hello world","proposedActions":[]}';
    const r = runChunks([json]);
    expect(r.text).toBe("Hello world");
    expect(r.finished).toBe(true);
    expect(r.state).toBe("done");
  });

  it("2. reply is not first field in JSON", () => {
    const json = '{"proposedActions":[],"reply":"Second field"}';
    const r = runChunks([json]);
    expect(r.text).toBe("Second field");
    expect(r.finished).toBe(true);
  });

  it("3. empty reply string", () => {
    const r = runChunks(['{"reply":"","x":1}']);
    expect(r.text).toBe("");
    expect(r.finished).toBe(true);
  });

  it("4. escaped quote", () => {
    const r = runChunks([JSON.stringify({ reply: 'She said "hi"', a: 1 })]);
    expect(r.text).toBe('She said "hi"');
    expect(r.finished).toBe(true);
  });

  it("5. escaped backslash", () => {
    const r = runChunks([JSON.stringify({ reply: "C:\\Users", b: 2 })]);
    expect(r.text).toBe("C:\\Users");
  });

  it("6. newline and tab escapes", () => {
    const r = runChunks([JSON.stringify({ proposedActions: [], reply: "a\nb\tc" })]);
    expect(r.text).toBe("a\nb\tc");
  });

  it("7. unicode escape BMP (€)", () => {
    const r = runChunks([JSON.stringify({ reply: "€" })]);
    expect(r.text).toBe("€");
  });

  it("8. unicode escape split across chunk boundaries (after \\u, hex split)", () => {
    const ex = createReplyExtractor();
    ex.feed('{"x":1,"reply":"\\u00');
    const a = ex.feed('A3"}');
    expect(a.deltaText).toBe("£");
    expect(a.finished).toBe(true);
  });

  it("9. escape sequence split — backslash at end of chunk", () => {
    const ex = createReplyExtractor();
    ex.feed('{"reply":"x');
    // One backslash: String.raw`\\` is *two* literal backslashes. Use a normal template/quote.
    const a = ex.feed(`\\`); // one backslash, partial
    expect(a.finished).toBe(false);
    const b = ex.feed(String.raw`n"}`); // n" completes \n
    expect(b.deltaText).toBe("\n");
    expect(b.finished).toBe(true);
  });

  it("10. reply content may contain the word reply in quotes", () => {
    const r = runChunks([JSON.stringify({ proposedActions: [], reply: 'The word "reply" here', z: 0 })]);
    expect(r.text).toBe('The word "reply" here');
  });

  it("11. trailing JSON after reply does not emit extra text", () => {
    const r = runChunks(
      [String.raw`{"reply":"Only this","proposedActions":[{"kind":"task"}]}`],
    );
    expect(r.text).toBe("Only this");
  });

  it("12. split surrogate pair across stream (emoji)", () => {
    const r = runChunks([JSON.stringify({ a: [], reply: "😀" })]);
    expect(r.text).toBe("😀");
  });
});

describe("createReplyExtractor — plain-text passthrough", () => {
  it("12b. plain-text passthrough (no JSON wrapper)", () => {
    const r = runChunks(["Just plain text"]);
    expect(r.text).toBe("Just plain text");
    expect(r.state).toBe("plain_text");
  });

  it("13. plain-text multiple chunks", () => {
    const ex = createReplyExtractor();
    expect(ex.feed("Hello").deltaText).toBe("Hello");
    expect(ex.state()).toBe("plain_text");
    const b = ex.feed(" world");
    expect(b.deltaText).toBe(" world");
  });
});

describe("edge: no partial escape emitted", () => {
  it("14. does not emit backslash or partial \\u as visible text", () => {
    const ex = createReplyExtractor();
    ex.feed('{"reply":"a\\u00');
    const a = ex.feed("41"); // 41 completes hex for A
    expect(a.deltaText).toBe("A");
    const b = ex.feed('" }');
    expect(b.finished).toBe(true);
  });
});

describe("finished state locks emission", () => {
  it("15. after done, further feed emits no text", () => {
    const ex = createReplyExtractor();
    ex.feed('{"reply":"x"}');
    const a = ex.feed(" trailing junk");
    expect(a.deltaText).toBe("");
    expect(a.finished).toBe(true);
  });
});

