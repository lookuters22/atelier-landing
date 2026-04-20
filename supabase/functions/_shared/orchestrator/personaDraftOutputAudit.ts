/**
 * Single place to run all **non–planner-leak** persona output auditors for orchestrator email drafts.
 * Used by {@link maybeRewriteOrchestratorDraftWithPersona} and repair loops so re-audit matches the first pass.
 */
import type { DecisionContext, PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import type { InquiryClaimPermissionMap } from "../../../../src/types/inquiryClaimPermissions.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import type { PersonaWriterStructuredOutput } from "../persona/personaAgent.ts";
import { auditDraftTerms, buildAuthoritativeCommercialContext, type AuditDraftTermsResult } from "./auditDraftCommercialTerms.ts";
import { auditAvailabilityRestrictedBookingProse } from "./availabilityInquiryBookingGuard.ts";
import { auditInquiryClaimPermissionViolations } from "./auditInquiryClaimPermissionViolations.ts";
import {
  auditUnsupportedBusinessAssertions,
  buildPersonaVerifiedGroundingBlob,
} from "./auditUnsupportedBusinessAssertions.ts";
import {
  applyBudgetStatementPlaceholder,
  auditBudgetStatementFinalEmail,
  auditBudgetStatementPlaceholderPresent,
  type BudgetStatementInjectionPlan,
} from "./budgetStatementInjection.ts";

export type PersonaDraftOutputAuditResult = {
  structured: PersonaWriterStructuredOutput;
  mergedViolations: string[];
  baseAudit: AuditDraftTermsResult;
  budgetViolations: string[];
  availabilityViolations: string[];
  unsupportedAssertionViolations: string[];
  inquiryClaimPermissionViolations: string[];
};

export function runOrchestratorPersonaOutputAudits(input: {
  structured: PersonaWriterStructuredOutput;
  budgetPlan: BudgetStatementInjectionPlan;
  inquiryReplyPlan: InquiryReplyPlan | null;
  inquiryClaimPermissions: InquiryClaimPermissionMap | null;
  decisionContext: DecisionContext;
  playbookRules: PlaybookRuleContextRow[];
  studioIdentityExcerpt: string | null;
}): PersonaDraftOutputAuditResult {
  let emailDraft = input.structured.email_draft;
  const budgetViolations: string[] = [];
  if (input.budgetPlan.mode === "inject") {
    const missingSlot = auditBudgetStatementPlaceholderPresent(emailDraft);
    if (missingSlot.length === 0) {
      emailDraft = applyBudgetStatementPlaceholder(emailDraft, input.budgetPlan.approvedParagraph);
    } else {
      budgetViolations.push(...missingSlot);
    }
    budgetViolations.push(...auditBudgetStatementFinalEmail(emailDraft, input.budgetPlan));
  }
  const structured: PersonaWriterStructuredOutput = { ...input.structured, email_draft: emailDraft };

  const authoritative = buildAuthoritativeCommercialContext(input.decisionContext, input.playbookRules);
  const baseAudit = auditDraftTerms(structured.committed_terms, authoritative, structured.email_draft);
  const availabilityViolations = auditAvailabilityRestrictedBookingProse(structured.email_draft, input.inquiryReplyPlan);
  const verifiedGrounding = buildPersonaVerifiedGroundingBlob(
    input.decisionContext,
    input.playbookRules,
    input.studioIdentityExcerpt,
  );
  const unsupportedAssertionViolations = auditUnsupportedBusinessAssertions(
    structured.email_draft,
    verifiedGrounding,
  );
  const inquiryClaimPermissionViolations = auditInquiryClaimPermissionViolations(
    structured.email_draft,
    input.inquiryClaimPermissions,
  );
  const mergedViolations = [
    ...(baseAudit.isValid ? [] : baseAudit.violations),
    ...budgetViolations,
    ...availabilityViolations,
    ...unsupportedAssertionViolations,
    ...inquiryClaimPermissionViolations,
  ];

  return {
    structured,
    mergedViolations: [...new Set(mergedViolations)],
    baseAudit,
    budgetViolations,
    availabilityViolations,
    unsupportedAssertionViolations,
    inquiryClaimPermissionViolations,
  };
}
