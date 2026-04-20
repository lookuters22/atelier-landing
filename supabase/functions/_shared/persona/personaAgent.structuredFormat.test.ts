/**
 * Locks tool description + user-message output suffix so first-touch drafts use multiple email_draft_lines paragraphs.
 */
import { describe, expect, it } from "vitest";
import { PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX } from "./personaAgent.ts";
import { buildPersonaAntiBrochureConstraintsSection } from "../prompts/personaAntiBrochureConstraints.ts";
import { buildNoCallPushEmailFirstUserHintBlock, PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER } from "../prompts/personaNoCallPushRealization.ts";

describe("persona structured output — paragraph layout", () => {
  it("exported suffix forbids merging greeting and intro in one email_draft_lines element", () => {
    expect(PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX).toMatch(/Hi \[Names\]/);
    expect(PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX).toMatch(/My name is Ana/);
    expect(PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX).toContain("email_draft_lines");
    expect(PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX).toMatch(/at least 3/);
    expect(PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX).toMatch(/adjective-stacking/i);
  });

  it("anti-brochure repeats layout so system prompt path gets the rule", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain("EMAIL PARAGRAPH LAYOUT");
    expect(s).toContain("Hi Name, My name is Ana");
  });

  it("no_call_push realization still wired and adds email_draft_lines layout hint", () => {
    const b = buildNoCallPushEmailFirstUserHintBlock();
    expect(b).toContain(PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER);
    expect(b).toContain("email_draft_lines");
  });
});
