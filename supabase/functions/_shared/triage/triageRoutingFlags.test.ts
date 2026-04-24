/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { afterEach, describe, expect, it } from "vitest";
import {
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
  getTriageQaBoundedNearMatchSyntheticConfidenceScore,
  isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled,
  isTriageBoundedUnresolvedEmailMatchmakerEnabled,
  isTriageDeterministicInquiryDedupV1Enabled,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV,
  TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV,
  TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
} from "./triageRoutingFlags.ts";

function deleteEnv(...keys: string[]) {
  for (const k of keys) delete process.env[k];
}

describe("triageRoutingFlags", () => {
  afterEach(() => {
    deleteEnv(
      TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV,
      TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV,
      TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
      TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV,
    );
  });

  it("isTriageBoundedUnresolvedEmailMatchmakerEnabled: default off; 1/true on", () => {
    delete process.env[TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV];
    expect(isTriageBoundedUnresolvedEmailMatchmakerEnabled()).toBe(false);
    process.env[TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV] = "1";
    expect(isTriageBoundedUnresolvedEmailMatchmakerEnabled()).toBe(true);
    process.env[TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV] = "true";
    expect(isTriageBoundedUnresolvedEmailMatchmakerEnabled()).toBe(true);
  });

  it("isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled: default off; 1/true on", () => {
    delete process.env[TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV];
    expect(isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled()).toBe(false);
    process.env[TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV] = "1";
    expect(isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled()).toBe(true);
  });

  it("isTriageDeterministicInquiryDedupV1Enabled: default on; 0/false/off/no off", () => {
    delete process.env[TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV];
    expect(isTriageDeterministicInquiryDedupV1Enabled()).toBe(true);
    process.env[TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV] = "0";
    expect(isTriageDeterministicInquiryDedupV1Enabled()).toBe(false);
    process.env[TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV] = "false";
    expect(isTriageDeterministicInquiryDedupV1Enabled()).toBe(false);
    process.env[TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV] = "off";
    expect(isTriageDeterministicInquiryDedupV1Enabled()).toBe(false);
    process.env[TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV] = "no";
    expect(isTriageDeterministicInquiryDedupV1Enabled()).toBe(false);
  });

  it("getTriageQaBoundedNearMatchSyntheticConfidenceScore: [75,89] only; else null", () => {
    delete process.env[TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV];
    expect(getTriageQaBoundedNearMatchSyntheticConfidenceScore()).toBeNull();
    process.env[TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV] = "not-a-number";
    expect(getTriageQaBoundedNearMatchSyntheticConfidenceScore()).toBeNull();
    process.env[TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV] = String(
      BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE - 1,
    );
    expect(getTriageQaBoundedNearMatchSyntheticConfidenceScore()).toBeNull();
    process.env[TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV] = String(
      BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
    );
    expect(getTriageQaBoundedNearMatchSyntheticConfidenceScore()).toBeNull();
    process.env[TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV] = "82";
    expect(getTriageQaBoundedNearMatchSyntheticConfidenceScore()).toBe(82);
  });
});
