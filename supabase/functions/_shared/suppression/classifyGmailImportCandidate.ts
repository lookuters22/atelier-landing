/**
 * Gmail-import-specific adapter around the pure inbound suppression classifier.
 *
 * Why a wrapper:
 *   - Gmail `import_candidates` rows carry extra signals that the generic
 *     classifier doesn't know about: `source_label_name` (the Gmail label the
 *     user used to quarantine the candidate).
 *   - At materialization time we often do NOT have the "From" header easily
 *     available in the prepared artifact path, but we always have
 *     `subject`, `snippet`, the materialized body, and the label name.
 *
 * Contract:
 *   - Pure function, safe for Deno workers.
 *   - Never throws on malformed input.
 *   - Returns the same shape as `classifyInboundSuppression`, plus an extra
 *     `labelHint` bump recorded in `reasons` when applicable.
 */
import {
  classifyInboundSuppression,
  type InboundSuppressionClassification,
  type InboundSuppressionReasonCode,
} from "../../../../src/lib/inboundSuppressionClassifier.ts";

/** Label name substrings that strongly imply a promo / system batch. */
const PROMO_LABEL_SUBSTRINGS: readonly string[] = [
  "promotion",
  "promotions",
  "promo",
  "marketing",
  "newsletter",
  "newsletters",
  "offers",
  "deals",
  "announce",
  "campaign",
  "campaigns",
  "updates",
  "bulletin",
];

const SYSTEM_LABEL_SUBSTRINGS: readonly string[] = [
  "notification",
  "notifications",
  "alerts",
  "automated",
  "system",
];

/**
 * Return true when a Gmail label name clearly indicates a bulk / non-client
 * batch (case-insensitive substring match). Conservative: does not match
 * neutral labels like "Clients", "Inquiries", "Pipeline", etc.
 */
export function gmailLabelLooksLikeBulkOrSystem(
  labelName: string | null | undefined,
): { promo: boolean; system: boolean } {
  const name = typeof labelName === "string" ? labelName.toLowerCase() : "";
  if (!name) return { promo: false, system: false };
  let promo = false;
  for (const sub of PROMO_LABEL_SUBSTRINGS) {
    if (name.includes(sub)) {
      promo = true;
      break;
    }
  }
  let system = false;
  for (const sub of SYSTEM_LABEL_SUBSTRINGS) {
    if (name.includes(sub)) {
      system = true;
      break;
    }
  }
  return { promo, system };
}

export type GmailImportCandidateClassificationInput = {
  /** Best-effort raw "From" sender string; may be empty when only snippet is available. */
  senderRaw?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body?: string | null;
  /** Gmail label the operator used to stage this candidate. */
  sourceLabelName?: string | null;
};

/**
 * Classify a Gmail import candidate. If the Gmail source label itself looks
 * like a promo / system batch (e.g. "Promotions"), that alone upgrades the
 * verdict — staging decisions trust the user's labeling signal.
 */
export function classifyGmailImportCandidate(
  input: GmailImportCandidateClassificationInput,
): InboundSuppressionClassification {
  const body = (input.body ?? "") || (input.snippet ?? "");
  const base = classifyInboundSuppression({
    senderRaw: input.senderRaw ?? null,
    subject: input.subject ?? null,
    body,
  });

  const labelHint = gmailLabelLooksLikeBulkOrSystem(input.sourceLabelName);
  if (!labelHint.promo && !labelHint.system) return base;

  const reasons: InboundSuppressionReasonCode[] = [...base.reasons];
  // We reuse existing reason codes; treat a bulk label as either a
  // marketing-subdomain equivalent (promo) or an automated disclaimer (system).
  const add = (r: InboundSuppressionReasonCode) => {
    if (!reasons.includes(r)) reasons.push(r);
  };

  if (labelHint.promo) add("sender_domain_marketing_subdomain");
  if (labelHint.system) add("body_automated_disclaimer");

  // If the base verdict was already human_client_or_lead but the Gmail label is
  // an unambiguous promo label, upgrade to promotional_or_marketing.
  if (base.verdict === "human_client_or_lead") {
    if (labelHint.promo) {
      return {
        ...base,
        verdict: "promotional_or_marketing",
        suppressed: true,
        reasons,
        confidence: base.confidence === "high" ? "high" : "medium",
      };
    }
    if (labelHint.system) {
      return {
        ...base,
        verdict: "system_or_notification",
        suppressed: true,
        reasons,
        confidence: base.confidence === "high" ? "high" : "medium",
      };
    }
  }

  return { ...base, reasons };
}
