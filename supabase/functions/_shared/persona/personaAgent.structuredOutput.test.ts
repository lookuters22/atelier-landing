import { describe, expect, it } from "vitest";
import {
  buildPersonaWriterStructuredFromRecord,
  extractPersonaStructuredFromAnthropicResponse,
  parsePersonaStructuredOutput,
  SUBMIT_PERSONA_DRAFT_TOOL_NAME,
} from "./personaAgent.ts";

describe("buildPersonaWriterStructuredFromRecord", () => {
  it("accepts tool-shaped input (same as legacy JSON object shape)", () => {
    const out = buildPersonaWriterStructuredFromRecord({
      email_draft_lines: ["Hello,", "Thanks."],
      committed_terms: {
        package_names: [],
        deposit_percentage: null,
        travel_miles_included: null,
      },
    });
    expect(out.email_draft).toBe("Hello,\n\nThanks.");
  });

  it("throws when email_draft_lines missing", () => {
    expect(() =>
      buildPersonaWriterStructuredFromRecord({
        committed_terms: { package_names: [], deposit_percentage: null, travel_miles_included: null },
      } as Record<string, unknown>),
    ).toThrow(/missing email_draft_lines/);
  });
});

describe("extractPersonaStructuredFromAnthropicResponse", () => {
  it("reads submit_persona_draft tool_use input and ignores broken assistant text", () => {
    const out = extractPersonaStructuredFromAnthropicResponse({
      content: [
        { type: "text", text: '{"broken": ' },
        {
          type: "tool_use",
          id: "toolu_01",
          name: SUBMIT_PERSONA_DRAFT_TOOL_NAME,
          input: {
            email_draft_lines: ["Line A", "Line B"],
            committed_terms: {
              package_names: ["X"],
              deposit_percentage: null,
              travel_miles_included: null,
            },
          },
        },
      ],
    });
    expect(out.email_draft).toBe("Line A\n\nLine B");
    expect(out.committed_terms.package_names).toEqual(["X"]);
  });

  it("throws when tool_use is missing", () => {
    expect(() =>
      extractPersonaStructuredFromAnthropicResponse({
        content: [{ type: "text", text: "hi" }],
      }),
    ).toThrow(/expected submit_persona_draft tool_use/);
  });

  it("skips other tools and uses submit_persona_draft", () => {
    const out = extractPersonaStructuredFromAnthropicResponse({
      content: [
        { type: "tool_use", id: "1", name: "other_tool", input: {} },
        {
          type: "tool_use",
          id: "2",
          name: SUBMIT_PERSONA_DRAFT_TOOL_NAME,
          input: {
            email_draft_lines: ["Ok"],
            committed_terms: {
              package_names: [],
              deposit_percentage: null,
              travel_miles_included: null,
            },
          },
        },
      ],
    });
    expect(out.email_draft).toBe("Ok");
  });
});

describe("parsePersonaStructuredOutput (legacy text JSON fallback path)", () => {
  it("parses email_draft_lines and joins with blank lines", () => {
    const raw = JSON.stringify({
      email_draft_lines: ["Hello there,", "We would love to help.", "Best,\nAna"],
      committed_terms: {
        package_names: ["Weekend"],
        deposit_percentage: 30,
        travel_miles_included: 50,
      },
    });
    const out = parsePersonaStructuredOutput(raw);
    expect(out.email_draft).toBe("Hello there,\n\nWe would love to help.\n\nBest, Ana");
    expect(out.committed_terms.package_names).toEqual(["Weekend"]);
    expect(out.committed_terms.deposit_percentage).toBe(30);
    expect(out.committed_terms.travel_miles_included).toBe(50);
  });

  it("strips markdown fences and parses inner JSON", () => {
    const inner = `{"email_draft_lines":["A","B"],"committed_terms":{"package_names":[],"deposit_percentage":null,"travel_miles_included":null}}`;
    const wrapped = "```json\n" + inner + "\n```";
    const out = parsePersonaStructuredOutput(wrapped);
    expect(out.email_draft).toBe("A\n\nB");
  });

  it("simulates assistant-prefilled continuation: leading { optional on tail", () => {
    const continuation =
      '"email_draft_lines":["One","Two"],"committed_terms":{"package_names":[],"deposit_percentage":null,"travel_miles_included":null}}';
    const combined = "{" + continuation;
    const out = parsePersonaStructuredOutput(combined);
    expect(out.email_draft).toBe("One\n\nTwo");
  });

  it("accepts full JSON when tail already starts with {", () => {
    const full =
      '{"email_draft_lines":["x"],"committed_terms":{"package_names":[],"deposit_percentage":null,"travel_miles_included":null}}';
    const out = parsePersonaStructuredOutput(full);
    expect(out.email_draft).toBe("x");
  });

  it("throws clear error on malformed JSON", () => {
    expect(() =>
      parsePersonaStructuredOutput(
        '{"email_draft_lines":[],"committed_terms":{"package_names":[],"deposit_percentage":oops}}',
      ),
    ).toThrow(/invalid structured JSON/i);
  });

  it("throws when email_draft_lines missing and no legacy email_draft", () => {
    const raw = JSON.stringify({
      committed_terms: { package_names: [], deposit_percentage: null, travel_miles_included: null },
    });
    expect(() => parsePersonaStructuredOutput(raw)).toThrow(/missing email_draft_lines/);
  });

  it("legacy email_draft string still parses when lines absent", () => {
    const raw = JSON.stringify({
      email_draft: "Single block",
      committed_terms: { package_names: [], deposit_percentage: null, travel_miles_included: null },
    });
    const out = parsePersonaStructuredOutput(raw);
    expect(out.email_draft).toBe("Single block");
  });

  it("multi-paragraph content via lines avoids single-string JSON control-character failure mode", () => {
    const obj = {
      email_draft_lines: [
        "Thanks for your note.",
        "Paragraph two has details.",
        "Kind regards.",
      ],
      committed_terms: {
        package_names: [],
        deposit_percentage: null,
        travel_miles_included: null,
      },
    };
    const out = parsePersonaStructuredOutput(JSON.stringify(obj));
    expect(out.email_draft.split("\n\n").length).toBe(3);
  });
});
