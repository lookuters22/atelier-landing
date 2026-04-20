/**
 * Locks real-operator cadence (Dana & Matt reference corpus) into prompts — not full email snapshots.
 */
import { describe, expect, it } from "vitest";
import {
  buildPersonaSystemPrompt,
  type PersonaWriterInputBoundary,
} from "../persona/personaAgent.ts";
import { buildPersonaAntiBrochureConstraintsSection } from "./personaAntiBrochureConstraints.ts";
import {
  buildPersonaStyleExamplesPromptSection,
  STUDIO_VOICE_EXAMPLES,
} from "./personaStudioVoiceExamples.ts";

const minimalBoundary: PersonaWriterInputBoundary = {
  narrowPersonalization: { coupleNames: null, location: null, weddingDate: null },
  limitedContinuityMemoryHeaders: [],
};

describe("real Ana voice — prompt corpus alignment", () => {
  it("style examples avoid brochure ‘thrilled to capture’ positioning from the old template", () => {
    const joined = Object.values(STUDIO_VOICE_EXAMPLES).join("\n");
    expect(joined.toLowerCase()).not.toContain("we would be thrilled");
    expect(joined.toLowerCase()).not.toContain("thrilled to capture");
  });

  it("style examples include authentic operator patterns from reference threads", () => {
    const joined = buildPersonaStyleExamplesPromptSection();
    expect(joined).toMatch(/Please let me know if you have any questions/i);
    expect(joined).toContain("I'm here to help!");
    expect(joined).toContain("Ana here—");
    expect(joined).toContain("[SHORT_STATUS_PING]");
    expect(joined).toContain("I'll let you know as soon as");
  });

  it("anti-brochure explicitly permits real-Ana closings and forbids abstract luxury voice", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain("Please don't hesitate to let me know if you have any questions");
    expect(s).toContain("at the heart of what we do");
    expect(s).toContain("the atmosphere you're describing");
  });

  it("style intro documents one email_draft_lines string per paragraph for real-email spacing", () => {
    const s = buildPersonaStyleExamplesPromptSection();
    expect(s).toContain("email_draft_lines");
  });

  it("includes plain follow-up micro-anchors for inbox-real question style", () => {
    const s = buildPersonaStyleExamplesPromptSection();
    expect(s).toContain("Plain follow-up micro-anchors");
    expect(s).toMatch(/I'd be happy to hear a bit more/i);
  });

  it("anti-brochure adds explicit anti–aesthetic-mirroring block (no adjective-stacking echo)", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain("ANTI-AESTHETIC MIRRORING");
    expect(s).toMatch(/short acknowledgment/i);
  });

  it("system prompt from personaAgent carries anti-mirroring line", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toMatch(/Anti-mirroring/i);
    expect(system).toMatch(/aesthetic descriptors/i);
  });
});
