/**
 * No-call-push email-first realization — prompt fragments wired into persona + anti-brochure.
 */
import { describe, expect, it } from "vitest";
import { buildPersonaSystemPrompt, type PersonaWriterInputBoundary } from "../persona/personaAgent.ts";
import { INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER } from "../orchestrator/deriveInquiryReplyPlan.ts";
import { buildPersonaAntiBrochureConstraintsSection } from "./personaAntiBrochureConstraints.ts";
import {
  buildNoCallPushEmailFirstUserHintBlock,
  PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER,
} from "./personaNoCallPushRealization.ts";

describe("personaNoCallPushRealization", () => {
  const minimalBoundary: PersonaWriterInputBoundary = {
    narrowPersonalization: { coupleNames: null, location: null, weddingDate: null },
    limitedContinuityMemoryHeaders: [],
  };

  it("user addendum contains the section marker and bans proactive call/conversation steer", () => {
    const b = buildNoCallPushEmailFirstUserHintBlock();
    expect(b).toContain(PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER);
    expect(b).toMatch(/Would a call work/i);
    expect(b).toMatch(/best way forward/i);
    expect(b).toContain("email_draft_lines");
    expect(b).toMatch(/paraphrase their aesthetic/i);
    expect(b).not.toMatch(/mirror their tone/i);
  });

  it("anti-brochure funnel rule references the no-call-push realization marker", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain(PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER);
  });

  it("system prompt instructs writers to follow the no-call-push marker when present in facts", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain(INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER);
    expect(system).toContain(PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER);
  });
});
