/**
 * Chunk 5 / G5 regression: mixed Gmail label batch cannot CRM-contaminate a project.
 *
 * All fixtures share one neutral label — label membership alone must not attach threads.
 * Mirrors `gmailImportMaterialize` grouped path: classify → (if !suppressed) eligibility → effectiveWeddingId.
 * Reuse path uses the same classifier + eligibility stack (see `gmailImportMaterialize.ts` reuse branch).
 */
import { describe, expect, it } from "vitest";

import { extractSenderEmailFromRaw } from "../../../../src/lib/inboundSuppressionClassifier.ts";
import { classifyGmailImportCandidate } from "../suppression/classifyGmailImportCandidate.ts";
import { evaluateGroupedImportAttachmentEligibility } from "./gmailProjectAttachmentEligibility.ts";

/** Same label for every row — Temu-style bug was "everything in the batch inherits the project". */
const SHARED_NEUTRAL_LABEL = "Wedding intake / same label";

type BatchFixture = {
  id: string;
  senderRaw: string;
  subject: string;
  body: string;
  /** Simulates `photographerHasClientMatchingEmail` for this sender (DB not hit). */
  knownClientEmailMatch: boolean;
};

function classifyAndEligibility(fixture: BatchFixture, anchorEmails: ReadonlySet<string>) {
  const classification = classifyGmailImportCandidate({
    senderRaw: fixture.senderRaw,
    subject: fixture.subject,
    snippet: null,
    body: fixture.body,
    sourceLabelName: SHARED_NEUTRAL_LABEL,
    headers: undefined,
  });
  const suppressed = classification.suppressed;
  const norm = extractSenderEmailFromRaw(fixture.senderRaw);
  let groupedAttachmentEligible: boolean | undefined;
  let groupedAttachmentReason: string | undefined;
  if (!suppressed) {
    const ev = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: norm,
      anchorNormalizedEmails: anchorEmails,
      knownClientEmailMatch: fixture.knownClientEmailMatch,
    });
    groupedAttachmentEligible = ev.eligible;
    groupedAttachmentReason = ev.reason;
  }
  return { classification, suppressed, groupedAttachmentEligible, groupedAttachmentReason, norm };
}

/** Same decision as `effectiveWeddingId` in `gmailImportMaterialize` for grouped import. */
function effectiveGroupedWeddingId(
  lazyBatchWeddingId: string | null,
  suppressed: boolean,
  groupedAttachmentEligible: boolean | undefined,
): string | null {
  if (suppressed) return null;
  const passes = groupedAttachmentEligible === true;
  if (!passes) return null;
  return lazyBatchWeddingId;
}

describe("G5 grouped import — mixed batch contamination regression", () => {
  const inquiry: BatchFixture = {
    id: "real_inquiry",
    senderRaw: "Sarah Tan <sarah.tan@gmail.com>",
    subject: "Our October wedding — checking availability",
    body:
      "Hi, we loved your portfolio and wanted to ask about availability for our October wedding. Could we hop on a call?",
    knownClientEmailMatch: true,
  };

  const promoNewsletter: BatchFixture = {
    id: "promo_newsletter",
    senderRaw: "Deals <news@brand.com>",
    subject: "This week only — 40% off prints",
    body: "Limited time offer. Unsubscribe at any time.",
    knownClientEmailMatch: false,
  };

  const receiptBilling: BatchFixture = {
    id: "receipt_billing",
    senderRaw: "Stripe <receipts@stripe.com>",
    subject: "Receipt from ACME Photography LLC",
    body: "Thank you for your payment. Amount paid $250.00. View your receipt online.",
    knownClientEmailMatch: false,
  };

  const ambiguousHuman: BatchFixture = {
    id: "ambiguous_unrelated_human",
    senderRaw: "Alex Rivera <alex.rivera@proton.me>",
    subject: "Quick question about travel photography",
    body:
      "Hi, I'm planning a family trip next year and wondered if you offer travel sessions unrelated to weddings. Thanks!",
    knownClientEmailMatch: false,
  };

  it("only the true inquiry attaches when batch wedding already exists (same neutral label for all)", () => {
    const lazyWeddingId = "w-batch-mixed-label";
    const anchorAfterInquiry = new Set<string>();

    for (const fixture of [inquiry, promoNewsletter, receiptBilling, ambiguousHuman]) {
      const {
        suppressed,
        groupedAttachmentEligible,
        classification,
        groupedAttachmentReason,
        norm,
      } = classifyAndEligibility(fixture, anchorAfterInquiry);

      const effective = effectiveGroupedWeddingId(lazyWeddingId, suppressed, groupedAttachmentEligible);

      if (fixture.id === "real_inquiry") {
        expect(suppressed, fixture.id).toBe(false);
        expect(groupedAttachmentEligible, fixture.id).toBe(true);
        expect(effective, fixture.id).toBe(lazyWeddingId);
        if (norm) anchorAfterInquiry.add(norm.toLowerCase());
      } else {
        expect(effective, `${fixture.id} must not inherit batch wedding`).toBeNull();
        if (suppressed) {
          expect(classification.suppressed).toBe(true);
          expect(classification.verdict).not.toBe("human_client_or_lead");
        } else {
          expect(groupedAttachmentEligible).toBe(false);
          expect(groupedAttachmentReason).toBe("no_positive_attachment_evidence");
        }
      }
    }
  });

  it("promo / receipt / ambiguous never attach even if processed before the inquiry (order-independent gate)", () => {
    const lazyWeddingId = "w-batch-order";
    const emptyAnchors = new Set<string>();

    const order = [ambiguousHuman, promoNewsletter, receiptBilling, inquiry];
    for (const fixture of order) {
      const { suppressed, groupedAttachmentEligible } = classifyAndEligibility(fixture, emptyAnchors);
      const effective = effectiveGroupedWeddingId(lazyWeddingId, suppressed, groupedAttachmentEligible);
      if (fixture.id !== "real_inquiry") {
        expect(effective, fixture.id).toBeNull();
      } else {
        expect(effective).toBe(lazyWeddingId);
      }
    }
  });

  it("records suppression vs ineligibility provenance signals (machine-readable)", () => {
    const anchor = new Set<string>();
    const promo = classifyAndEligibility(promoNewsletter, anchor);
    expect(promo.suppressed).toBe(true);
    expect(
      promo.classification.verdict === "promotional_or_marketing" ||
        promo.classification.verdict === "system_or_notification",
    ).toBe(true);
    expect(promo.groupedAttachmentReason).toBeUndefined();

    const receipt = classifyAndEligibility(receiptBilling, anchor);
    expect(receipt.suppressed).toBe(true);
    expect(receipt.classification.verdict).toBe("transactional_non_client");
    expect(receipt.classification.reasons.length).toBeGreaterThan(0);

    const amb = classifyAndEligibility(ambiguousHuman, anchor);
    expect(amb.suppressed).toBe(false);
    expect(amb.groupedAttachmentReason).toBe("no_positive_attachment_evidence");
  });

  it("no candidate eligible: nothing would justify attaching to a batch wedding from eligibility alone", () => {
    const onlyStrangers: BatchFixture[] = [
      { ...ambiguousHuman, id: "a" },
      {
        id: "b",
        senderRaw: "Jamie Lee <jamie@fastmail.com>",
        subject: "Referral from a friend",
        body: "A friend mentioned you — we're not sure about dates yet but wanted to say hello.",
        knownClientEmailMatch: false,
      },
    ];
    const anchor = new Set<string>();
    let anyEligible = false;
    for (const f of onlyStrangers) {
      const { suppressed, groupedAttachmentEligible } = classifyAndEligibility(f, anchor);
      expect(suppressed, f.id).toBe(false);
      expect(groupedAttachmentEligible, f.id).toBe(false);
      if (groupedAttachmentEligible === true) anyEligible = true;
    }
    expect(anyEligible).toBe(false);
  });

  it("sender anchor after inquiry allows same-email follow-up (not same as unrelated contamination)", () => {
    const lazyWeddingId = "w-anchored";
    const anchor = new Set<string>(["sarah.tan@gmail.com"]);

    const followUp: BatchFixture = {
      id: "same_client_second_thread",
      senderRaw: "Sarah Tan <sarah.tan@gmail.com>",
      subject: "Re: October wedding — one more question",
      body: "Following up on timing for the engagement session. Thanks!",
      knownClientEmailMatch: false,
    };

    const r = classifyAndEligibility(followUp, anchor);
    expect(r.suppressed).toBe(false);
    expect(r.groupedAttachmentEligible).toBe(true);
    expect(effectiveGroupedWeddingId(lazyWeddingId, r.suppressed, r.groupedAttachmentEligible)).toBe(
      lazyWeddingId,
    );
  });
});

describe("G5 grouped import — reuse path parity (static contract)", () => {
  it("materialize reuse branch runs the same classifier + eligibility gates as new-thread", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "supabase/functions/_shared/gmail/gmailImportMaterialize.ts"),
      "utf-8",
    );
    expect(src).toMatch(/if \(existing\?\.id\)[\s\S]*?classifyGmailImportCandidate/);
    expect(src).toMatch(/if \(gmailLabelImportGroupId && !suppressedReuse\)[\s\S]*?evaluateGroupedImportAttachmentEligibility/);
    expect(src).toMatch(/if \(groupedImport && !suppressed\)[\s\S]*?evaluateGroupedImportAttachmentEligibility/);
  });
});

describe("G5 grouped import — worker lazy wedding gate (static)", () => {
  it("processGmailLabelGroupApproval only calls ensureBatchWeddingForGroup when attachmentEligible", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "supabase/functions/inngest/functions/processGmailLabelGroupApproval.ts"),
      "utf-8",
    );
    expect(src).toMatch(
      /if\s*\(\s*!suppressed\s*&&\s*attachmentEligible\s*&&\s*!lazyWedding\.weddingId\s*\)\s*\{[\s\S]*?ensureBatchWeddingForGroup\s*\(/,
    );
  });
});

describe("Manual / convert provenance (cross-check)", () => {
  it("link + convert migrations still avoid wiping ai_routing_metadata", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const linkConvert = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260511000000_thread_routing_metadata_audit_history.sql",
      ),
      "utf-8",
    );
    expect(linkConvert).not.toMatch(/ai_routing_metadata\s*=\s*NULL/);
    const convertLock = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260512000000_convert_unfiled_thread_to_inquiry_row_lock.sql",
      ),
      "utf-8",
    );
    expect(convertLock).not.toMatch(/ai_routing_metadata\s*=\s*NULL/);
  });
});
