import { describe, expect, it } from "vitest";
import { secondaryPendingRenderRepairEligibility } from "./gmailImportSecondaryPendingRepair.ts";

describe("gmailImportSecondaryPendingRepair (render eligibility)", () => {
  it("no_ref when metadata has no render_html_ref", () => {
    expect(secondaryPendingRenderRepairEligibility({}, null)).toBe("no_ref");
  });

  it("needs_link when ref present but FK differs", () => {
    expect(
      secondaryPendingRenderRepairEligibility(
        {
          gmail_import: {
            render_html_ref: {
              version: 1,
              artifact_id: "art-1",
              storage_bucket: "message_attachment_media",
              storage_path: "p/x.html",
              byte_size: 1,
            },
          },
        },
        null,
      ),
    ).toBe("needs_link");
  });

  it("already_linked when message FK matches ref", () => {
    expect(
      secondaryPendingRenderRepairEligibility(
        {
          gmail_import: {
            render_html_ref: {
              version: 1,
              artifact_id: "art-1",
              storage_bucket: "message_attachment_media",
              storage_path: "p/x.html",
              byte_size: 1,
            },
          },
        },
        "art-1",
      ),
    ).toBe("already_linked");
  });
});
