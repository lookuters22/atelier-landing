import { describe, expect, it } from "vitest";
import type { InquiryClaimPermissionMap } from "../../../../src/types/inquiryClaimPermissions.types.ts";
import {
  auditInquiryClaimPermissionViolations,
  INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX,
} from "./auditInquiryClaimPermissionViolations.ts";

function basePermissions(over: Partial<InquiryClaimPermissionMap> = {}): InquiryClaimPermissionMap {
  return {
    schemaVersion: 1,
    availability: "defer",
    destination_fit: "explore",
    destination_logistics: "explore",
    offering_fit: "explore",
    proposal_process: "explore",
    booking_next_step: "explore",
    deliverable_inclusions: "explore",
    ...over,
  };
}

describe("auditInquiryClaimPermissionViolations", () => {
  it("returns empty when permissions are null (non-inquiry path)", () => {
    expect(auditInquiryClaimPermissionViolations("Any text", null)).toEqual([]);
  });

  it("flags confirm-tier availability when availability permission is defer", () => {
    const v = auditInquiryClaimPermissionViolations(
      "May 2027 is well within our availability.",
      basePermissions({ availability: "defer" }),
    );
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.startsWith(INQUIRY_CLAIM_PERMISSION_VIOLATION_PREFIX + "availability"))).toBe(true);
  });

  it("flags destination capability when destination_fit is explore", () => {
    const v = auditInquiryClaimPermissionViolations(
      "We absolutely photograph destination weddings outside Serbia.",
      basePermissions(),
    );
    expect(v.some((x) => x.includes("destination"))).toBe(true);
  });

  it("allows destination prose when destination_fit is confirm", () => {
    const v = auditInquiryClaimPermissionViolations(
      "We photograph destination weddings and can align travel with your timeline.",
      basePermissions({ destination_fit: "confirm", destination_logistics: "confirm" }),
    );
    expect(v.filter((x) => x.includes("destination"))).toEqual([]);
  });

  it("flags exactly / love-to-photograph offering copy when offering_fit is soft_confirm", () => {
    const v = auditInquiryClaimPermissionViolations(
      "That sounds like exactly the kind of celebration we love to photograph.",
      basePermissions({ offering_fit: "soft_confirm" }),
    );
    expect(v.some((x) => x.includes("offering_fit"))).toBe(true);
  });

  it("allows aligned exploratory offering copy when offering_fit is soft_confirm", () => {
    const v = auditInquiryClaimPermissionViolations(
      "That sounds aligned with what you described. We can talk through how that could fit the day.",
      basePermissions({ offering_fit: "soft_confirm" }),
    );
    expect(v.filter((x) => x.includes("offering_fit"))).toEqual([]);
  });

  it("flags settled capability language when offering_fit is explore", () => {
    const v = auditInquiryClaimPermissionViolations(
      "This is very much in line with how we usually work with couples.",
      basePermissions({ offering_fit: "explore" }),
    );
    expect(v.some((x) => x.includes("offering_fit"))).toBe(true);
  });

  it("flags proposal process claims when proposal_process is explore", () => {
    const v = auditInquiryClaimPermissionViolations(
      "We usually structure smaller weddings like this with one continuous thread.",
      basePermissions({ proposal_process: "explore" }),
    );
    expect(v.some((x) => x.includes("proposal_process"))).toBe(true);
  });

  it("allows proposal discussion hedges when proposal_process is explore", () => {
    const v = auditInquiryClaimPermissionViolations(
      "We'd be happy to shape that with you in a proposal once we align on scope.",
      basePermissions({ proposal_process: "explore" }),
    );
    expect(v.filter((x) => x.includes("proposal_process"))).toEqual([]);
  });

  it("does not flag availability concrete wording when availability is confirm", () => {
    const v = auditInquiryClaimPermissionViolations(
      "Once we align on scope, May 2027 is well within our availability.",
      basePermissions({ availability: "confirm" }),
    );
    expect(v.filter((x) => x.includes("availability"))).toEqual([]);
  });

  /** Narrow contract: only booking_next_step is restricted — regression for prompt-only hole. */
  function confirmExceptBookingExplore(): InquiryClaimPermissionMap {
    return basePermissions({
      availability: "confirm",
      destination_fit: "confirm",
      destination_logistics: "confirm",
      offering_fit: "confirm",
      proposal_process: "confirm",
      deliverable_inclusions: "confirm",
      booking_next_step: "explore",
    });
  }

  describe("booking_next_step", () => {
    it("explore: flags concrete next-step / booking CTAs", () => {
      const perms = confirmExceptBookingExplore();
      const drafts = [
        "The next step is a brief call whenever works for you.",
        "You can book a time here when you're ready.",
        "I'd love to set up a time for you to connect with us.",
        "We can send the collections next if you'd like to see options.",
        "We'll start with a consultation and go from there.",
      ];
      for (const d of drafts) {
        const v = auditInquiryClaimPermissionViolations(d, perms);
        expect(v.some((x) => x.includes("booking_next_step")), d).toBe(true);
      }
    });

    it("explore: allows discussive / exploratory next-step language", () => {
      const perms = confirmExceptBookingExplore();
      const ok = [
        "If you'd like, we can talk through next steps together.",
        "We can discuss what the next step could look like on your side.",
        "Happy to talk through next steps if that's helpful.",
        "If the date is still open on our side, the next step would be a quick call to align on scope.",
        "Let me know what the next step is on your end — happy to follow your lead.",
      ];
      for (const d of ok) {
        const v = auditInquiryClaimPermissionViolations(d, perms);
        expect(v.filter((x) => x.includes("booking_next_step")), d).toEqual([]);
      }
    });

    it("explore: flags soft scheduling invites (not only hard phrases)", () => {
      const v = auditInquiryClaimPermissionViolations(
        "Happy to set up a brief call if that would help.",
        confirmExceptBookingExplore(),
      );
      expect(v.some((x) => x.includes("booking_next_step"))).toBe(true);
    });

    it("confirm: allows direct next-step and booking guidance", () => {
      const perms = basePermissions({
        availability: "confirm",
        destination_fit: "confirm",
        destination_logistics: "confirm",
        offering_fit: "confirm",
        proposal_process: "confirm",
        deliverable_inclusions: "confirm",
        booking_next_step: "confirm",
      });
      const ok = [
        "The next step is a brief call — I'll send a few times.",
        "You can book a time here: [link].",
        "We can start with a consultation and then tailor a proposal.",
      ];
      for (const d of ok) {
        const v = auditInquiryClaimPermissionViolations(d, perms);
        expect(v.filter((x) => x.includes("booking_next_step")), d).toEqual([]);
      }
    });

    it("defer: blocks concrete and soft operational CTAs", () => {
      const perms = basePermissions({ booking_next_step: "defer" });
      expect(
        auditInquiryClaimPermissionViolations("The next step is a brief call.", perms).some((x) =>
          x.includes("booking_next_step"),
        ),
      ).toBe(true);
      expect(
        auditInquiryClaimPermissionViolations("Happy to set up a brief call when you’re ready.", perms).some((x) =>
          x.includes("booking_next_step"),
        ),
      ).toBe(true);
    });

    it("soft_confirm: blocks definitive next-step and settled funnel habit", () => {
      const perms = basePermissions({
        availability: "confirm",
        destination_fit: "confirm",
        destination_logistics: "confirm",
        offering_fit: "confirm",
        proposal_process: "confirm",
        deliverable_inclusions: "confirm",
        booking_next_step: "soft_confirm",
      });
      expect(
        auditInquiryClaimPermissionViolations("The next step is a brief call.", perms).some((x) =>
          x.includes("booking_next_step"),
        ),
      ).toBe(true);
      expect(
        auditInquiryClaimPermissionViolations("We usually begin with a consultation.", perms).some((x) =>
          x.includes("booking_next_step"),
        ),
      ).toBe(true);
    });

    it("soft_confirm: allows cautious scheduling invite without definitive next-step framing", () => {
      const perms = basePermissions({
        availability: "confirm",
        destination_fit: "confirm",
        destination_logistics: "confirm",
        offering_fit: "confirm",
        proposal_process: "confirm",
        deliverable_inclusions: "confirm",
        booking_next_step: "soft_confirm",
      });
      const v = auditInquiryClaimPermissionViolations(
        "Happy to set up a brief call if that would be useful on your side.",
        perms,
      );
      expect(v.filter((x) => x.includes("booking_next_step"))).toEqual([]);
    });

    it("explore: flags soft proactive live-call / conversation steer (no_call_push audit gap)", () => {
      const perms = confirmExceptBookingExplore();
      const bad = [
        "Would a call work for you in the coming weeks?",
        "The best way forward would be a conversation where we can walk through what matters.",
        "Would you be open to a call next week?",
        "I'd love to learn more over a conversation when you have a moment.",
        "Let's connect over a call to align on scope.",
        "We can talk through this on a call if that helps.",
        "Have a conversation about your day — happy to hear more.",
      ];
      for (const d of bad) {
        expect(
          auditInquiryClaimPermissionViolations(d, perms).some((x) => x.includes("booking_next_step")),
          d,
        ).toBe(true);
      }
    });

    it("explore: allows email-first continuation without live-call steer", () => {
      const perms = confirmExceptBookingExplore();
      const ok = [
        "If helpful, feel free to share a bit more about the day you're planning.",
        "I'd be happy to learn more about what you have in mind.",
        "Please let me know if you'd like to share any more details.",
        "We can continue the conversation here and I'll help however I can.",
        "Happy to keep the thread going by email whenever it helps.",
      ];
      for (const d of ok) {
        expect(auditInquiryClaimPermissionViolations(d, perms).filter((x) => x.includes("booking_next_step")), d).toEqual(
          [],
        );
      }
    });

    it("soft_confirm: proactive 'Would a call work' still allowed (rank 2)", () => {
      const perms = basePermissions({
        availability: "confirm",
        destination_fit: "confirm",
        destination_logistics: "confirm",
        offering_fit: "confirm",
        proposal_process: "confirm",
        deliverable_inclusions: "confirm",
        booking_next_step: "soft_confirm",
      });
      const v = auditInquiryClaimPermissionViolations(
        "Would a call work for you in the coming weeks if that would help?",
        perms,
      );
      expect(v.filter((x) => x.includes("booking_next_step"))).toEqual([]);
    });
  });
});
