import { describe, expect, it } from "vitest";
import { evaluatePreLlmInboundEmail } from "./preLlmEmailRouting.ts";
import {
  evaluatePostIngestSuppressionAfterPreLlm,
  extractRoutingSignalsV1FromMessageMetadata,
  synthesizeSuppressionHeadersFromRoutingSignals,
} from "./postIngestSuppressionGate.ts";

const routingBase = {
  version: 1 as const,
  has_list_unsubscribe: false,
  precedence_bulk_or_junk: false,
  auto_submitted_present: false,
  has_feedback_id: false,
  sender_localpart_class: "looks_human" as const,
};

function metaWithSignals(signals: Record<string, unknown>) {
  return {
    gmail_import: {
      routing_signals: { ...routingBase, ...signals },
    },
  };
}

describe("synthesizeSuppressionHeadersFromRoutingSignals", () => {
  it("maps persisted flags to stub header values", () => {
    expect(
      synthesizeSuppressionHeadersFromRoutingSignals({
        ...routingBase,
        has_list_unsubscribe: true,
        precedence_bulk_or_junk: true,
        auto_submitted_present: true,
      }),
    ).toEqual({
      "list-unsubscribe": "<stub>",
      precedence: "bulk",
      "auto-submitted": "auto-generated",
    });
  });

  it("returns empty object when routing is null", () => {
    expect(synthesizeSuppressionHeadersFromRoutingSignals(null)).toEqual({});
  });
});

describe("extractRoutingSignalsV1FromMessageMetadata", () => {
  it("reads v1 routing_signals from gmail_import", () => {
    const m = metaWithSignals({ has_list_unsubscribe: true });
    const r = extractRoutingSignalsV1FromMessageMetadata(m);
    expect(r?.has_list_unsubscribe).toBe(true);
    expect(r?.version).toBe(1);
  });

  it("returns null when version is not 1", () => {
    expect(
      extractRoutingSignalsV1FromMessageMetadata({
        gmail_import: { routing_signals: { version: 2 } },
      }),
    ).toBeNull();
  });
});

describe("evaluatePostIngestSuppressionAfterPreLlm (Layer 1b, after needs_llm)", () => {
  it("suppresses plugin-style newsletter: human local-part + list-unsubscribe + % off subject + unsubscribe body", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: metaWithSignals({
        has_list_unsubscribe: true,
        has_feedback_id: false,
        sender_localpart_class: "looks_human",
      }),
      senderRaw: "Magnus Team <team.magnus@example.com>",
      subject: "88% off Magnus MK3",
      body: "Limited time.\n\nClick here to unsubscribe from this list.",
    });
    expect(r.kind).toBe("heuristic_filtered");
    if (r.kind === "heuristic_filtered") {
      expect(r.metadata.routing_disposition).toBe("promo_automated");
      expect(r.metadata.routing_layer).toBe("suppression_classifier_v1");
      expect(r.metadata.heuristic_reasons).toContain("header_list_unsubscribe");
      expect(r.metadata.heuristic_reasons.length).toBeGreaterThan(0);
    }
  });

  it("suppresses Temu-style mail: marketplace domain + list-unsubscribe + unsubscribe body", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: metaWithSignals({
        has_list_unsubscribe: true,
        sender_localpart_class: "looks_human",
      }),
      senderRaw: "Temu <temu@eu.temuemail.com>",
      subject: "Potvrda isporuke Vašeg poklona!",
      body: "Hvala na kupovini.\n\nTo unsubscribe from marketing emails, visit our preferences.",
    });
    expect(r.kind).toBe("heuristic_filtered");
  });

  it("suppresses OTA / marketplace sender (booking.com)", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: {},
      senderRaw: "Booking.com <noreply@mail.booking.com>",
      subject: "Your reservation",
      body: "Details inside.",
    });
    expect(r.kind).toBe("heuristic_filtered");
    if (r.kind === "heuristic_filtered") {
      expect(r.metadata.heuristic_reasons).toContain("sender_domain_ota_or_marketplace");
    }
  });

  it("does not suppress on a single weak list-unsubscribe signal alone", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: metaWithSignals({
        has_list_unsubscribe: true,
        sender_localpart_class: "looks_human",
      }),
      senderRaw: "Alex Client <alex.client@example.com>",
      subject: "Question about our engagement session",
      body: "Hi — could we move our session to Saturday?",
    });
    expect(r.kind).toBe("continue");
  });

  it("allows real human wedding inquiry without bulk headers", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: {},
      senderRaw: "Sarah <sarah.bride@gmail.com>",
      subject: "June 2027 wedding photography",
      body:
        "We're getting married in June 2027 in Vermont and love your portfolio. " +
        "Could you share your availability and packages?",
    });
    expect(r.kind).toBe("continue");
  });

  it("allows real human non-wedding business inquiry", () => {
    const r = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: {},
      senderRaw: "James <james@acmecorp.com>",
      subject: "Corporate headshot quote",
      body:
        "Our team needs updated headshots at our downtown office. " +
        "Could you send pricing for ~15 people?",
    });
    expect(r.kind).toBe("continue");
  });
});

describe("Layer-1 precedence bulk (no Layer 1b)", () => {
  it("still exits via evaluatePreLlmInboundEmail automated_or_bulk — second gate not used in orchestration", () => {
    const pre = evaluatePreLlmInboundEmail({
      messageMetadata: metaWithSignals({
        precedence_bulk_or_junk: true,
        sender_localpart_class: "looks_human",
      }),
      senderRaw: "Human <human@example.com>",
    });
    expect(pre.kind).toBe("automated_or_bulk");
    if (pre.kind === "automated_or_bulk") {
      expect(pre.reasons).toContain("precedence_bulk_or_junk");
    }
    const second = evaluatePostIngestSuppressionAfterPreLlm({
      messageMetadata: metaWithSignals({
        precedence_bulk_or_junk: true,
        sender_localpart_class: "looks_human",
      }),
      senderRaw: "Human <human@example.com>",
      subject: "Hello",
      body: "Hi",
    });
    expect(second.kind).toBe("continue");
  });
});
