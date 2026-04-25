/**
 * Cross-ingest parity proofs: shared triage modules vs Gmail/post-ingest canonical (`inbox/thread.requires_triage.v1`).
 * **Historical:** pre-ingress `comms/email.received` + removed `traffic-cop-triage` matched this ordering for email;
 * live primary ingress is Gmail/thread post-ingest only.
 * See docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md (P1, P17) and UNFILED_UNRESOLVED_MATCHING_SLICE.md.
 *
 * **Bounded unresolved subset:** legacy pre-ingress email enabled `boundedUnresolvedSubsetEligible` only for that path;
 * `processInboxThreadRequiresTriage.ts` enables it only when `source === "gmail_delta"`. That is intentional ingress
 * metadata, not shared-function drift.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  deriveEmailIngressRouting,
  enforceStageGate,
  matchmakerStageIntentForGmailClassifier,
  type MatchmakerStepResult,
} from "./emailIngressClassification.ts";
import { evaluateDeterministicHumanNonClientIngress } from "./deterministicOperatorReviewIngress.ts";
import { evaluatePostIngestSuppressionAfterPreLlm } from "./postIngestSuppressionGate.ts";
import { evaluateRawEmailIngressSuppression } from "./rawEmailIngressSuppressionGate.ts";

beforeAll(() => {
  (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: () => undefined },
  };
});

const routingSignalsBase = {
  version: 1 as const,
  has_list_unsubscribe: false,
  precedence_bulk_or_junk: false,
  auto_submitted_present: false,
  has_feedback_id: false,
  sender_localpart_class: "looks_human" as const,
};

function messageMetadataWithSignals(signals: Record<string, unknown>) {
  return {
    gmail_import: {
      routing_signals: { ...routingSignalsBase, ...signals },
    },
  };
}

describe("cross-ingest suppression (Layer 1b): raw comms vs post-ingest synthesized headers", () => {
  it("vendor / bulk newsletter: same verdict via real headers vs persisted routing_signals stubs", () => {
    const senderRaw = "Growth Team <deals@mail.seo-partner.example>";
    const subject = "Quick question about your rankings";
    const body = "We help studios scale leads. Unsubscribe any time.";

    const raw = evaluateRawEmailIngressSuppression({
      rawEmail: {
        headers: {
          "list-unsubscribe": "<mailto:unsub@seo.example>",
          precedence: "bulk",
        },
      },
      senderRaw,
      subject,
      body,
    });

    const post = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: messageMetadataWithSignals({
        has_list_unsubscribe: true,
        precedence_bulk_or_junk: true,
      }),
      senderRaw,
      subject,
      body,
    });

    expect(raw.suppressed).toBe(true);
    expect(post.kind).toBe("heuristic_filtered");
    expect(raw.verdict).toBe("promotional_or_marketing");
    if (post.kind === "heuristic_filtered") {
      expect(post.metadata.routing_layer).toBe("suppression_classifier_v1");
      expect(post.metadata.heuristic_reasons).toEqual(expect.arrayContaining(raw.reasons));
    }
  });

  it("Stripe-style auto-submitted: raw header vs routing_signals flag", () => {
    const senderRaw = "Stripe <noreply@stripe.com>";
    const subject = "Your payout has been scheduled";
    const body = "This is an automated message. Please do not reply to this email.";

    const raw = evaluateRawEmailIngressSuppression({
      rawEmail: { headers: { "auto-submitted": "auto-generated" } },
      senderRaw,
      subject,
      body,
    });

    const post = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: messageMetadataWithSignals({ auto_submitted_present: true }),
      senderRaw,
      subject,
      body,
    });

    expect(raw.suppressed).toBe(true);
    expect(post.kind).toBe("heuristic_filtered");
    expect(raw.verdict).toBe("system_or_notification");
  });
});

describe("cross-ingest deterministic human non-client ingress (shared evaluateDeterministicHumanNonClientIngress)", () => {
  it("vendor solicitation: same deterministic status across raw vs post-ingest gates (shared ingress helpers)", () => {
    const subject = "SEO audit + link-building outreach for your studio";
    const body =
      "Hi,\nWe are a digital marketing agency specializing in link building campaigns for creative studios.\nBest,\nAlex";
    const r = evaluateDeterministicHumanNonClientIngress({ subject, body });
    expect(r).toMatchObject({
      match: true,
      variant: "vendor_partnership",
      triageReturnStatus: "deterministic_vendor_partnership_operator_review",
    });
    if (r.match && r.variant === "vendor_partnership") {
      expect(r.routingMetadata.routing_layer).toBe("deterministic_vendor_partnership_ingress_v1");
      expect(r.sender_role).toBe("vendor_solicitation");
    }
  });

  it("recruiter outreach: same triage status across ingest lanes", () => {
    const subject = "Full-time producer role — remote-friendly";
    const body =
      "Hi,\nI'm a technical recruiter at Northwind. We have a full-time role at a Bay Area post house.\nCould you share an updated resume if you're open to a chat?\nThanks,\nMorgan";
    const r = evaluateDeterministicHumanNonClientIngress({ subject, body });
    expect(r).toMatchObject({
      match: true,
      variant: "recruiter",
      triageReturnStatus: "deterministic_recruiter_job_operator_review",
    });
    if (r.match && r.variant === "recruiter") {
      expect(r.routingMetadata.routing_layer).toBe("deterministic_recruiter_job_ingress_v1");
    }
  });

  it("billing follow-up: same triage status across ingest lanes", () => {
    const subject = "Re: Invoice #1042 — May retainer";
    const body = "Hi,\nPlease let us know if you need anything else.\nThanks,\nMaria";
    const r = evaluateDeterministicHumanNonClientIngress({ subject, body });
    expect(r).toMatchObject({
      match: true,
      variant: "billing",
      triageReturnStatus: "deterministic_billing_account_operator_review",
    });
    if (r.match && r.variant === "billing") {
      expect(r.routingMetadata.routing_layer).toBe("deterministic_billing_account_ingress_v1");
    }
  });
});

describe("cross-ingest matchmaker intent: intentional difference (documented)", () => {
  it("unlinked + LLM concierge: main email path gates matchmaker with intake; Gmail uses raw LLM for matchmaker", () => {
    const identity = { weddingId: null, photographerId: "p1", projectStage: null } as const;
    const llmIntent = "concierge" as const;
    const stageGate = enforceStageGate(llmIntent, identity.projectStage, !!identity.weddingId);
    const gmailMatchmakerIntent = matchmakerStageIntentForGmailClassifier(llmIntent, identity);
    expect(stageGate).toBe("intake");
    expect(gmailMatchmakerIntent).toBe("concierge");
  });
});

describe("cross-ingest deriveEmailIngressRouting: parity when wedding is resolved", () => {
  const dedupResolved: MatchmakerStepResult = {
    weddingId: "w-dedup",
    match: {
      suggested_wedding_id: "w-dedup",
      confidence_score: 95,
      reasoning: "sender_email_on_project",
    },
    photographerId: "p1",
    resolved_wedding_project_stage: "booked",
    matchmaker_invoked: true,
    matchmaker_skip_reason: "deterministic_inquiry_dedup_resolved",
  };

  it("legacy vs gmail_canonical agree on dispatch when finalWeddingId is set (clean inquiry / dedup-shaped)", () => {
    const identity = { weddingId: null, photographerId: "p1", projectStage: null };
    const llmIntent = "concierge";
    const stageGateIntent = enforceStageGate(llmIntent, identity.projectStage, !!identity.weddingId);

    const legacy = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult: dedupResolved,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "legacy",
    });

    const gmail = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult: dedupResolved,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "gmail_canonical",
    });

    expect(legacy.finalWeddingId).toBe("w-dedup");
    expect(gmail.finalWeddingId).toBe("w-dedup");
    expect(legacy.dispatchIntent).toBe("concierge");
    expect(gmail.dispatchIntent).toBe("concierge");
  });
});

describe("bounded deterministic near-match (approval escalation gate on)", () => {
  it("same deriveEmailIngressRouting sets nearMatchForApproval for legacy and gmail_canonical (both lanes use this helper)", () => {
    const prevDeno = (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno;
    (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
      env: {
        get: (k: string) =>
          k === "TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1" ? "1" : undefined,
      },
    };
    try {
      const matchNear: MatchmakerStepResult = {
        weddingId: null,
        match: {
          suggested_wedding_id: "w-cand",
          confidence_score: 80,
          reasoning: "sender_email_multi_project",
        },
        matchmaker_invoked: true,
        matchmaker_skip_reason: "deterministic_inquiry_dedup_near_match",
      };

      const identity = { weddingId: null, photographerId: "p1", projectStage: null };
      const llmIntent = "concierge";
      const stageGateIntent = enforceStageGate(llmIntent, identity.projectStage, !!identity.weddingId);

      const legacy = deriveEmailIngressRouting({
        identity,
        llmIntent,
        stageGateIntent,
        matchResult: matchNear,
        payloadPhotographerId: "p1",
        boundedUnresolvedSubsetEligible: false,
        derivePolicy: "legacy",
      });

      const gmail = deriveEmailIngressRouting({
        identity,
        llmIntent,
        stageGateIntent,
        matchResult: matchNear,
        payloadPhotographerId: "p1",
        boundedUnresolvedSubsetEligible: false,
        derivePolicy: "gmail_canonical",
      });

      expect(legacy.nearMatchForApproval).toBe(true);
      expect(gmail.nearMatchForApproval).toBe(true);
      expect(legacy.boundedUnresolved.outcome).toBe("escalated_for_approval");
      expect(gmail.boundedUnresolved.outcome).toBe("escalated_for_approval");
    } finally {
      if (prevDeno !== undefined) {
        (globalThis as unknown as { Deno?: typeof prevDeno }).Deno = prevDeno;
      }
    }
  });
});

describe("cross-ingest deriveEmailIngressRouting: intentional Gmail-canonical unlinked policy", () => {
  const emptyMatch: MatchmakerStepResult = {
    weddingId: null,
    match: null,
    matchmaker_invoked: false,
    matchmaker_skip_reason: "stage_gate_intake_without_deterministic_wedding",
  };

  it("unlinked + no wedding: legacy coerces dispatch to intake; gmail_canonical preserves LLM concierge", () => {
    const identity = { weddingId: null, photographerId: "p1", projectStage: null };
    const llmIntent = "concierge";
    const stageGateIntent = enforceStageGate(llmIntent, identity.projectStage, !!identity.weddingId);

    const legacy = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult: emptyMatch,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "legacy",
    });

    const gmail = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult: emptyMatch,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "gmail_canonical",
    });

    expect(legacy.dispatchIntent).toBe("intake");
    expect(gmail.dispatchIntent).toBe("concierge");
  });
});
