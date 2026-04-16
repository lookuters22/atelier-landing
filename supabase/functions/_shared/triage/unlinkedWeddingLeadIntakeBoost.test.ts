import { describe, expect, it } from "vitest";
import { applyUnlinkedWeddingLeadIntakeBoost } from "./unlinkedWeddingLeadIntakeBoost.ts";

const plannerRfqTitle = "RFQ: Alexandra & Sebastian // September 2027 // Chateau de Vair";
const plannerRfqBody = `
Hi,

I'm the wedding planner for Alexandra & Sebastian. We're looking at September 2027 at Chateau de Vair
and are shortlisting photographers. Please share your packages and pricing for full-day coverage.
We also need clarity on whether you can coordinate with the venue on sound recording for the ceremony.

Thanks,
Jordan Lee Events
`.trim();

describe("applyUnlinkedWeddingLeadIntakeBoost", () => {
  it("upgrades planner wedding RFQ with pricing + technical asks from commercial to intake", () => {
    expect(
      applyUnlinkedWeddingLeadIntakeBoost("commercial", plannerRfqBody, plannerRfqTitle),
    ).toBe("intake");
  });

  it("upgrades couple inquiry with package pricing language to intake", () => {
    const body =
      "Hi! We're getting married June 2028 in Tuscany — can you send packages and pricing for 10 hours?";
    expect(applyUnlinkedWeddingLeadIntakeBoost("commercial", body, "Wedding photography inquiry")).toBe("intake");
  });

  it("does not upgrade true payment / invoice threads", () => {
    const body =
      "Hi, this is a reminder that invoice INV-992 is past due. Please remit the balance on your existing booking.";
    expect(applyUnlinkedWeddingLeadIntakeBoost("commercial", body, "Re: Payment reminder")).toBe("commercial");
  });

  it("does not upgrade non-wedding B2B production inquiry", () => {
    const body =
      "We're looking for a quote for corporate product photography and podcast studio rental next quarter — rate card please.";
    expect(applyUnlinkedWeddingLeadIntakeBoost("commercial", body, "Production quote")).toBe("commercial");
  });

  it("keeps wedding inquiry with audio/sound requirements as intake when boosted from commercial", () => {
    const body =
      "Planning our wedding for May 2026 at Villa Rosa. Need photography coverage and want to confirm you can work with our team on ceremony audio capture.";
    expect(applyUnlinkedWeddingLeadIntakeBoost("commercial", body, "Wedding — May 2026")).toBe("intake");
  });

  it("upgrades planner RFQ with wedding/audio language from studio to intake when misclassified", () => {
    expect(
      applyUnlinkedWeddingLeadIntakeBoost("studio", plannerRfqBody, plannerRfqTitle),
    ).toBe("intake");
  });

  it("keeps genuine post-wedding gallery / album / delivery threads as studio", () => {
    const body = `
Hi Sarah,

The online gallery from your June wedding is now live. Use the link below to proof your album selections and place any print orders.

Best,
Alex
    `.trim();
    expect(applyUnlinkedWeddingLeadIntakeBoost("studio", body, "Your gallery is ready")).toBe("studio");
  });

  it("does not change non-correctable intents", () => {
    expect(applyUnlinkedWeddingLeadIntakeBoost("intake", plannerRfqBody, plannerRfqTitle)).toBe("intake");
    expect(applyUnlinkedWeddingLeadIntakeBoost("logistics", "flights", "Travel")).toBe("logistics");
  });
});
