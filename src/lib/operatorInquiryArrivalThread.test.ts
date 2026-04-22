import { describe, expect, it } from "vitest";
import { isOperatorInquiryArrivalThread } from "./operatorInquiryArrivalThread.ts";

describe("isOperatorInquiryArrivalThread", () => {
  it("returns true for linked projects in a pre-booking inquiry stage", () => {
    expect(
      isOperatorInquiryArrivalThread({
        weddingId: "w1",
        weddingStage: "inquiry",
        ai_routing_metadata: null,
      }),
    ).toBe(true);
    expect(
      isOperatorInquiryArrivalThread({
        weddingId: "w1",
        weddingStage: "proposal_sent",
        ai_routing_metadata: null,
      }),
    ).toBe(true);
  });

  it("returns false for linked projects past the inquiry pipeline (e.g. booked)", () => {
    expect(
      isOperatorInquiryArrivalThread({
        weddingId: "w1",
        weddingStage: "booked",
        ai_routing_metadata: null,
      }),
    ).toBe(false);
  });

  it("uses deriveInboxThreadBucket for unlinked rows (inquiry = customer_lead)", () => {
    expect(
      isOperatorInquiryArrivalThread({
        weddingId: null,
        weddingStage: null,
        ai_routing_metadata: { sender_role: "customer_lead" },
      }),
    ).toBe(true);
    expect(
      isOperatorInquiryArrivalThread({
        weddingId: null,
        weddingStage: null,
        ai_routing_metadata: { sender_role: "vendor_solicitation" },
      }),
    ).toBe(false);
  });
});
