/**
 * After Slice A2 inserts the deterministic orchestrator **stub** body, optionally replace it with
 * real client-facing prose via {@link draftPersonaStructuredResponse} (Anthropic tool `submit_persona_draft` → `email_draft_lines` joined + `committed_terms`) and
 * {@link auditDraftTerms} backstop (same writer boundary as WhatsApp `draftPersonaResponse` for non-orchestrator flows).
 *
 * - **Default:** rewrite when `ANTHROPIC_API_KEY` is set (unset `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY` → try persona).
 * - **Force stub:** `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=0` or `false` (parity / QA harness).
 * - **Force persona:** `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=1` (requires API key).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  DecisionContext,
  OrchestratorDraftAttemptResult,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import { parsePhotographerSettings, readPhotographerSettings } from "../../../../src/lib/photographerSettings.ts";
import { formatCompactContinuityForPersonaWriter } from "../memory/buildPersonaRawFacts.ts";
import { sanitizeInboundTextForModelContext } from "../memory/sanitizeInboundTextForModelContext.ts";
import { draftPersonaStructuredResponse, type PersonaWriterStructuredOutput } from "../persona/personaAgent.ts";
import {
  redactPersonaCommittedTermsForAudience,
  redactPlannerPrivateCommercialText,
  redactPersonaWriterFactsBlockForAudience,
} from "../context/applyAudiencePrivateCommercialRedaction.ts";
import { auditDraftTerms, buildAuthoritativeCommercialContext } from "./auditDraftCommercialTerms.ts";
import { auditPlannerPrivateLeakage } from "./auditPlannerPrivateLeakage.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";
import { buildOrchestratorStubDraftBody } from "./attemptOrchestratorDraft.ts";
import { recordV3OutputAuditorEscalation } from "./recordV3OutputAuditorEscalation.ts";
import {
  applyBudgetStatementPlaceholder,
  auditBudgetStatementFinalEmail,
  auditBudgetStatementPlaceholderPresent,
  buildBudgetStatementSlotFactsSection,
  hasBudgetStatementPlaceholder,
  planBudgetStatementInjection,
  V3_PRICING_DATA_GUARDRAIL_STEP,
  V3_PRICING_GUARDRAIL_BODY_MARKER,
  type BudgetStatementInjectionPlan,
} from "./budgetStatementInjection.ts";
import { auditAvailabilityRestrictedBookingProse } from "./availabilityInquiryBookingGuard.ts";
import {
  buildInquiryReplyStrategyFactsSection,
  deriveInquiryReplyPlan,
} from "./deriveInquiryReplyPlan.ts";
import {
  buildCommercialDepositStarvationFullFallbackFactsSection,
  buildCommercialDepositStarvationLastMileProximityBlock,
  COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER,
  shouldAppendCommercialDepositStarvationLastMileFacts,
} from "./orchestratorCommercialDepositStarvation.ts";

/** Include enough rows for policy coverage; orchestrator rationale alone has no verified numbers. */
const PLAYBOOK_RULES_MAX = 50;
const PLAYBOOK_INSTRUCTION_MAX = 400;

function playbookExcerptsFromRules(rules: PlaybookRuleContextRow[], maxLines: number): string[] {
  return rules
    .filter((r) => r.is_active !== false)
    .slice(0, maxLines)
    .map((r) => {
      const topic = r.topic ?? "rule";
      const ins = (r.instruction ?? "").trim().slice(0, PLAYBOOK_INSTRUCTION_MAX);
      return `${topic}: ${ins}`;
    });
}

/**
 * Business-profile identity only (typed `photographers.settings` contract keys).
 * **V3 policy substance** must come from `playbook_rules` + orchestrator `DecisionContext` — not from arbitrary JSON blobs.
 */
export async function fetchStudioIdentityExcerptForPersonaWriter(
  supabase: Parameters<typeof readPhotographerSettings>[0],
  photographerId: string,
): Promise<string | null> {
  let loaded: Awaited<ReturnType<typeof readPhotographerSettings>>;
  try {
    loaded = await readPhotographerSettings(supabase, photographerId);
  } catch (e) {
    console.warn(
      "[orchestrator persona] fetchStudioIdentityExcerptForPersonaWriter:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
  if (!loaded) return null;

  const contract = parsePhotographerSettings(loaded.raw);
  const lines: string[] = [];
  const studioBits = [
    contract.studio_name ? `studio_name: ${contract.studio_name}` : null,
    contract.currency ? `currency: ${contract.currency}` : null,
    contract.manager_name ? `manager_name: ${contract.manager_name}` : null,
    contract.timezone ? `timezone: ${contract.timezone}` : null,
  ].filter(Boolean);
  if (studioBits.length > 0) {
    lines.push("Studio identity (business profile / contract keys on photographers.settings):", ...studioBits.map((s) => `- ${s}`));
  }

  const text = lines.join("\n").trim();
  return text.length > 0 ? text : null;
}

/** Narrow case-memory lines for writer (headers only; matches harness `v3_verify_case_note` or first rows). */
function formatCaseMemoryHeadersForWriterFacts(dc: DecisionContext): string | null {
  const headers = dc.memoryHeaders ?? [];
  const tagged = headers.filter((h) => h.type === "v3_verify_case_note");
  const pick = tagged.length > 0 ? tagged.slice(0, 2) : headers.slice(0, 2);
  if (pick.length === 0) return null;
  const lines = pick.map((h) => `- [${h.type}] ${h.title}: ${h.summary.trim().slice(0, 220)}`);
  return ["Case memory headers (supporting context — if conflict with playbook_rules, prefer playbook):", ...lines].join("\n");
}

/** Scoped CRM row fields for writer grounding (must match `buildAgentContext` loadCrmSnapshot). */
function formatAuthoritativeCrmFromSnapshot(snap: Record<string, unknown>): string | null {
  if (!snap || Object.keys(snap).length === 0) return null;
  const rows: string[] = [];
  const pick = (key: string) => {
    const v = snap[key];
    if (v === null || v === undefined) return;
    if (typeof v === "string" && v.trim() === "") return;
    const display = typeof v === "number" ? String(v) : String(v).trim();
    rows.push(`- ${key}: ${display}`);
  };
  pick("couple_names");
  pick("wedding_date");
  pick("location");
  pick("stage");
  pick("package_name");
  pick("contract_value");
  if (rows.length === 0) return null;
  return [
    "=== Authoritative CRM (verified tenant record) ===",
    "These fields come from the scoped `weddings` row for this orchestrator turn. Use them as the canonical record for couple name, wedding date, location, stage, package_name (when set), and contract value.",
    "If client inbound wording conflicts with wedding_date or location here (e.g. wrong month or region), prefer this block for the reply—do not invent a different calendar date, city, or region.",
    ...rows,
  ].join("\n");
}

export function buildOrchestratorFactsForPersonaWriter(
  chosen: OrchestratorProposalCandidate,
  rawMessage: string,
  playbookRules: PlaybookRuleContextRow[],
  studioIdentityExcerpt: string | null,
  decisionContext: DecisionContext,
  budgetPlan: BudgetStatementInjectionPlan = { mode: "none" },
  inquiryReplyPlan: InquiryReplyPlan | null = null,
): string {
  const safeInbound = sanitizeInboundTextForModelContext(rawMessage);
  const lines: string[] = [
    `Approved orchestrator action: ${chosen.action_family} (${chosen.action_key}).`,
    `Orchestrator rationale (generic — does not verify pricing/policy numbers): ${chosen.rationale}`,
    "",
  ];

  if (inquiryReplyPlan !== null) {
    lines.push(buildInquiryReplyStrategyFactsSection(inquiryReplyPlan), "");
  }

  const crmBlock = formatAuthoritativeCrmFromSnapshot(decisionContext.crmSnapshot ?? emptyCrmSnapshot());
  if (crmBlock) {
    lines.push(crmBlock, "");
  }

  const continuity = formatCompactContinuityForPersonaWriter(
    decisionContext.threadSummary ?? null,
    decisionContext.recentMessages ?? [],
  );
  if (continuity) {
    lines.push(continuity, "");
  }

  lines.push("Client inbound (verbatim):", safeInbound.trim());

  if (studioIdentityExcerpt && studioIdentityExcerpt.trim().length > 0) {
    lines.push("", "=== Business profile (identity only — not policy) ===", studioIdentityExcerpt);
  }

  const mem = formatCaseMemoryHeadersForWriterFacts(decisionContext);
  if (mem) {
    lines.push("", "=== Case memory (headers) ===", mem);
  }

  const excerpts = playbookExcerptsFromRules(playbookRules, PLAYBOOK_RULES_MAX);
  if (excerpts.length > 0) {
    lines.push("", "=== Verified policy: active playbook_rules (primary source for fees, retainers, insurance stance) ===");
    for (const ex of excerpts) lines.push(`- ${ex}`);
  } else {
    lines.push("", "=== Verified policy: playbook_rules (none in snapshot) ===");
  }

  const unknownSignals = buildUnknownPolicySignals(playbookRules, safeInbound);
  if (unknownSignals.length > 0) {
    lines.push("", "=== Explicit unknown / do-not-assert signals ===");
    for (const s of unknownSignals) lines.push(`- ${s}`);
  }

  if (chosen.blockers_or_missing_facts.length > 0) {
    lines.push("", `Open notes / missing facts: ${chosen.blockers_or_missing_facts.join("; ")}`);
  }

  if (budgetPlan.mode === "inject") {
    lines.push(buildBudgetStatementSlotFactsSection());
  }

  lines.push(
    "",
    "=== Orchestrator grounding guardrails (offerings & products) ===",
    "- **Interpretation policy for this turn (V3):** Client-suggested package names, collection tiers, deliverables, or product labels in the inbound are **not** verified studio offerings merely because the client said them.",
    "- **Verified offering context** = **Authoritative CRM** (especially `package_name` when present) + **Verified policy: playbook_rules** + explicit studio lines under Business profile (identity only) / case memory headers—not unverified client labels alone.",
    "- The deterministic orchestrator has already chosen an action (above). Do **not** treat adoption of a client product name as grounded unless it appears in that verified context; when grounding is absent, the reply must stay **non-confirming**: neutral phrasing (e.g. \"the option you're considering\"), brief clarification, or a constrained answer that does **not** restate the client-invented name as a booked or official studio SKU.",
    "- Do not upgrade routing or outcomes here—the Writer only composes prose consistent with the approved action and these rules.",
    "",
    "=== Verification rules for the reply (mandatory) ===",
    "- **Authoritative CRM** (when present) is the canonical source for wedding_date, location, couple_names, stage, package_name, and contract_value. Prefer it over conflicting casual phrasing in the client inbound.",
    "- **Packages & products:** Do not invent, confirm, or repeat client-suggested collection/package/product names as factual studio offerings unless the same name (or clear equivalent) appears in **Authoritative CRM** or **Verified policy: playbook_rules**. Client inbound alone does **not** verify an offering.",
    "- State specific numbers (percentages, retainers, payment-milestone percentages, travel miles/km, fees, insurance coverage, or legal commitments) only if they appear under **Verified policy: playbook_rules** above. Do not mirror the client's suggested percentages or mileage as facts when those figures are absent from that verified block.",
    "- **Miles/km vs percent:** Never convert a distance (e.g. \"50 miles\") into a percentage, or mix up two different numbers from the client message—each numeric claim needs matching verified playbook text.",
    "- Do not treat business profile identity as pricing policy.",
    "- If an **Explicit unknown** line appears, follow it: hedge, confirm, or defer — never invent.",
    "- If the client asks to confirm a term not covered by playbook rules, do not invent — acknowledge and confirm from the contract or team.",
    "",
  );

  if (
    shouldAppendCommercialDepositStarvationLastMileFacts(
      playbookRules,
      chosen,
      decisionContext.audience,
      inquiryReplyPlan,
    )
  ) {
    const useProximityOnly = chosen.rationale.includes(COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER);
    lines.push(
      useProximityOnly
        ? buildCommercialDepositStarvationLastMileProximityBlock()
        : buildCommercialDepositStarvationFullFallbackFactsSection(),
      "",
    );
  }

  lines.push(
    "Write a single client-facing reply email body. Do not mention internal orchestrator, drafts, or approval machinery.",
  );
  return lines.join("\n");
}

const MISSING_PRICING_DATA_VIOLATION =
  "MISSING_PRICING_DATA: inbound matches a budget-fit pricing question but active playbook_rules did not yield a verified minimum-investment paragraph for deterministic injection — persona writer skipped.";

async function applyVerifiedMinimumPricingGuardrailBlock(
  supabase: SupabaseClient,
  params: {
    decisionContext: DecisionContext;
    draftAttempt: OrchestratorDraftAttemptResult;
    rawMessage: string;
    playbookRules: PlaybookRuleContextRow[];
    photographerId: string;
    replyChannel: "email" | "web";
    threadId: string | null;
    budgetPlan: Extract<BudgetStatementInjectionPlan, { mode: "blocked_missing_pricing_data" }>;
    inquiryReplyPlan: InquiryReplyPlan | null;
  },
): Promise<Extract<PersonaDraftRewriteResult, { applied: true }>> {
  const chosen = params.draftAttempt.chosenCandidate!;
  const body = buildOrchestratorStubDraftBody(
    chosen,
    params.rawMessage,
    params.replyChannel,
    params.playbookRules,
    params.decisionContext.audience,
  );
  const violations = [MISSING_PRICING_DATA_VIOLATION];
  const pricingGuardrailDetail =
    `Automated reply blocked: verified minimum-investment policy text is not available in active playbook_rules (${params.budgetPlan.code}). ` +
    "Do not send client-facing studio pricing without playbook grounding.";

  const { data: row, error: fetchErr } = await supabase
    .from("drafts")
    .select("instruction_history")
    .eq("id", params.draftAttempt.draftId)
    .single();

  if (fetchErr) {
    return {
      applied: true,
      draftId: params.draftAttempt.draftId!,
      auditPassed: false,
      violations: [`fetch_instruction_history:${fetchErr.message}`],
      escalationId: null,
    };
  }

  const prior = Array.isArray(row?.instruction_history) ? (row!.instruction_history as unknown[]) : [];

  const guardStep = {
    step: V3_PRICING_DATA_GUARDRAIL_STEP,
    source: "planBudgetStatementInjection",
    code: params.budgetPlan.code,
    operator_detail: `${V3_PRICING_GUARDRAIL_BODY_MARKER} ${pricingGuardrailDetail}`,
    ...(params.inquiryReplyPlan !== null
      ? {
          inquiry_reply_plan: {
            schemaVersion: params.inquiryReplyPlan.schemaVersion,
            inquiry_motion: params.inquiryReplyPlan.inquiry_motion,
            confirm_availability: params.inquiryReplyPlan.confirm_availability,
            mention_booking_terms: params.inquiryReplyPlan.mention_booking_terms,
            budget_clause_mode: params.inquiryReplyPlan.budget_clause_mode,
            opening_tone: params.inquiryReplyPlan.opening_tone,
            cta_type: params.inquiryReplyPlan.cta_type,
          },
        }
      : {}),
  };

  let escalationId: string | null = null;
  if (params.threadId) {
    const esc = await recordV3OutputAuditorEscalation(supabase, {
      photographerId: params.photographerId,
      threadId: params.threadId,
      weddingId: params.decisionContext.weddingId ?? null,
      violations,
      draftId: params.draftAttempt.draftId!,
      variant: "commercial",
    });
    escalationId = esc?.id ?? null;
  }

  const nextHistory = [
    ...prior,
    guardStep,
    {
      step: "v3_output_auditor_commercial_terms",
      passed: false,
      violations,
      escalation_id: escalationId,
      reason: params.budgetPlan.code,
    },
  ];

  const { error: upErr } = await supabase
    .from("drafts")
    .update({
      body,
      instruction_history: nextHistory,
    })
    .eq("id", params.draftAttempt.draftId);

  if (upErr) {
    return {
      applied: true,
      draftId: params.draftAttempt.draftId!,
      auditPassed: false,
      violations: [`draft_update_failed:${upErr.message}`],
      escalationId,
    };
  }

  return {
    applied: true,
    draftId: params.draftAttempt.draftId!,
    auditPassed: false,
    violations,
    escalationId,
  };
}

export function shouldRewriteOrchestratorDraftWithPersona(): boolean {
  const explicit = Deno.env.get("ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY")?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false") return false;
  if (explicit === "1" || explicit === "true") return true;
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY")?.trim());
}

export type PersonaDraftRewriteResult =
  | { applied: true; draftId: string; auditPassed: true }
  | {
      applied: true;
      draftId: string;
      auditPassed: false;
      violations: string[];
      escalationId: string | null;
    }
  | { applied: false; reason: string };

export async function maybeRewriteOrchestratorDraftWithPersona(
  supabase: SupabaseClient,
  params: {
    decisionContext: DecisionContext;
    draftAttempt: OrchestratorDraftAttemptResult;
    rawMessage: string;
    playbookRules: PlaybookRuleContextRow[];
    photographerId: string;
    replyChannel: "email" | "web";
    threadId: string | null;
  },
): Promise<PersonaDraftRewriteResult> {
  if (!params.draftAttempt.draftCreated || !params.draftAttempt.draftId || !params.draftAttempt.chosenCandidate) {
    return { applied: false, reason: "no_orchestrator_draft" };
  }

  const budgetPlan = planBudgetStatementInjection(params.rawMessage, params.playbookRules);
  const inquiryReplyPlan = deriveInquiryReplyPlan({
    decisionContext: params.decisionContext,
    rawMessage: params.rawMessage,
    playbookRules: params.playbookRules,
    budgetPlan,
  });

  if (budgetPlan.mode === "blocked_missing_pricing_data") {
    return applyVerifiedMinimumPricingGuardrailBlock(supabase, {
      decisionContext: params.decisionContext,
      draftAttempt: params.draftAttempt,
      rawMessage: params.rawMessage,
      playbookRules: params.playbookRules,
      photographerId: params.photographerId,
      replyChannel: params.replyChannel,
      threadId: params.threadId,
      budgetPlan,
      inquiryReplyPlan,
    });
  }

  if (!shouldRewriteOrchestratorDraftWithPersona()) {
    return { applied: false, reason: "persona_writer_disabled_or_no_api_key" };
  }

  const chosen = params.draftAttempt.chosenCandidate;
  const studioId = await fetchStudioIdentityExcerptForPersonaWriter(supabase, params.photographerId);
  const facts = redactPersonaWriterFactsBlockForAudience(
    buildOrchestratorFactsForPersonaWriter(
      chosen,
      params.rawMessage,
      params.playbookRules,
      studioId,
      params.decisionContext,
      budgetPlan,
      inquiryReplyPlan,
    ),
    params.decisionContext.audience,
  );

  const draftId = params.draftAttempt.draftId!;
  const { data: rowEarly, error: fetchEarlyErr } = await supabase
    .from("drafts")
    .select("instruction_history")
    .eq("id", draftId)
    .single();

  if (fetchEarlyErr) {
    return { applied: false, reason: `fetch_instruction_history:${fetchEarlyErr.message}` };
  }
  const prior = Array.isArray(rowEarly?.instruction_history) ? (rowEarly!.instruction_history as unknown[]) : [];

  let structured: PersonaWriterStructuredOutput;
  try {
    structured = await draftPersonaStructuredResponse(params.decisionContext, facts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[clientOrchestratorV1] persona draft rewrite failed:", msg);
    const violations = [`persona_structured_output_failed:${msg.slice(0, 800)}`];

    let escalationId: string | null = null;
    if (params.threadId) {
      const esc = await recordV3OutputAuditorEscalation(supabase, {
        photographerId: params.photographerId,
        threadId: params.threadId,
        weddingId: params.decisionContext.weddingId ?? null,
        violations,
        draftId,
        variant: "persona_structured_output",
      });
      escalationId = esc?.id ?? null;
    }

    const body = buildOrchestratorStubDraftBody(
      chosen,
      params.rawMessage,
      params.replyChannel,
      params.playbookRules,
      params.decisionContext.audience,
    );
    const failStep = {
      step: "persona_writer_after_client_orchestrator_v1",
      source: "personaAgent.draftPersonaStructuredResponse",
      model: "claude-haiku-4-5",
      failed: true as const,
      error: msg.slice(0, 2000),
      operator_notice:
        "Automated client-facing rewrite did not complete — do not send this draft as final copy. See error and violations in this history entry.",
      violations,
      escalation_id: escalationId,
    };
    const structuredFailureAuditStep = {
      step: "v3_persona_structured_output_escalation",
      passed: false as const,
      reason_code: "persona_structured_output_failed" as const,
      violations,
      escalation_id: escalationId,
    };
    const { error: upErr } = await supabase
      .from("drafts")
      .update({
        body,
        instruction_history: [...prior, failStep, structuredFailureAuditStep],
      })
      .eq("id", draftId);

    if (upErr) {
      return { applied: false, reason: `draft_update_failed:${upErr.message}` };
    }

    return {
      applied: true,
      draftId,
      auditPassed: false,
      violations,
      escalationId,
    };
  }

  const emailFromModel = structured.email_draft;
  let emailDraft = emailFromModel;
  const budgetViolations: string[] = [];
  if (budgetPlan.mode === "inject") {
    const missingSlot = auditBudgetStatementPlaceholderPresent(emailDraft);
    if (missingSlot.length === 0) {
      emailDraft = applyBudgetStatementPlaceholder(emailDraft, budgetPlan.approvedParagraph);
    } else {
      budgetViolations.push(...missingSlot);
    }
    budgetViolations.push(...auditBudgetStatementFinalEmail(emailDraft, budgetPlan));
  }
  structured = { ...structured, email_draft: emailDraft };

  const authoritative = buildAuthoritativeCommercialContext(params.decisionContext, params.playbookRules);
  const baseAudit = auditDraftTerms(structured.committed_terms, authoritative, structured.email_draft);
  const availabilityViolations = auditAvailabilityRestrictedBookingProse(structured.email_draft, inquiryReplyPlan);
  const mergedViolations = [
    ...(baseAudit.isValid ? [] : baseAudit.violations),
    ...budgetViolations,
    ...availabilityViolations,
  ];
  const audit =
    mergedViolations.length === 0 ? baseAudit : { isValid: false as const, violations: mergedViolations };

  const enforceClientSafeProse = params.decisionContext.audience.clientVisibleForPrivateCommercialRedaction;
  const leakAudit = auditPlannerPrivateLeakage(structured.email_draft, enforceClientSafeProse);
  const committedTermsForHistory = redactPersonaCommittedTermsForAudience(
    structured.committed_terms,
    params.decisionContext.audience,
  );
  const personaStep = {
    step: "persona_writer_after_client_orchestrator_v1",
    source: "personaAgent.draftPersonaStructuredResponse",
    model: "claude-haiku-4-5",
    committed_terms: committedTermsForHistory,
    ...(inquiryReplyPlan !== null
      ? {
          inquiry_reply_plan: {
            schemaVersion: inquiryReplyPlan.schemaVersion,
            inquiry_motion: inquiryReplyPlan.inquiry_motion,
            confirm_availability: inquiryReplyPlan.confirm_availability,
            mention_booking_terms: inquiryReplyPlan.mention_booking_terms,
            budget_clause_mode: inquiryReplyPlan.budget_clause_mode,
            opening_tone: inquiryReplyPlan.opening_tone,
            cta_type: inquiryReplyPlan.cta_type,
          },
        }
      : {}),
    ...(budgetPlan.mode === "inject"
      ? {
          budget_statement_injection: {
            model_had_placeholder: hasBudgetStatementPlaceholder(emailFromModel),
            approved_excerpt: params.decisionContext.audience.clientVisibleForPrivateCommercialRedaction
              ? redactPlannerPrivateCommercialText(budgetPlan.approvedParagraph.slice(0, 160))
              : budgetPlan.approvedParagraph.slice(0, 160),
          },
        }
      : {}),
  };

  if (audit.isValid === false) {
    const body = buildOrchestratorStubDraftBody(
      chosen,
      params.rawMessage,
      params.replyChannel,
      params.playbookRules,
      params.decisionContext.audience,
    );

    let escalationId: string | null = null;
    if (params.threadId) {
      const esc = await recordV3OutputAuditorEscalation(supabase, {
        photographerId: params.photographerId,
        threadId: params.threadId,
        weddingId: params.decisionContext.weddingId ?? null,
        violations: audit.violations,
        draftId: params.draftAttempt.draftId,
        variant: "commercial",
      });
      escalationId = esc?.id ?? null;
    }

    const nextHistory = [
      ...prior,
      personaStep,
      {
        step: "v3_output_auditor_commercial_terms",
        passed: false,
        violations: audit.violations,
        escalation_id: escalationId,
        operator_notice:
          "Persona draft did not pass automated commercial review — body reset to pending placeholder. See violations in this history entry.",
      },
    ];

    const { error: upErr } = await supabase
      .from("drafts")
      .update({
        body,
        instruction_history: nextHistory,
      })
      .eq("id", params.draftAttempt.draftId);

    if (upErr) {
      return { applied: false, reason: `draft_update_failed:${upErr.message}` };
    }

    return {
      applied: true,
      draftId: params.draftAttempt.draftId,
      auditPassed: false,
      violations: audit.violations,
      escalationId,
    };
  }

  if (leakAudit.isValid === false) {
    const body = buildOrchestratorStubDraftBody(
      chosen,
      params.rawMessage,
      params.replyChannel,
      params.playbookRules,
      params.decisionContext.audience,
    );

    let escalationId: string | null = null;
    if (params.threadId) {
      const esc = await recordV3OutputAuditorEscalation(supabase, {
        photographerId: params.photographerId,
        threadId: params.threadId,
        weddingId: params.decisionContext.weddingId ?? null,
        violations: leakAudit.violations,
        draftId: params.draftAttempt.draftId,
        variant: "planner_private_leak",
      });
      escalationId = esc?.id ?? null;
    }

    const nextHistory = [
      ...prior,
      personaStep,
      { step: "v3_output_auditor_commercial_terms", passed: true },
      {
        step: "v3_output_auditor_planner_private_leakage",
        passed: false,
        violations: leakAudit.violations,
        escalation_id: escalationId,
        operator_notice:
          "Planner-private wording was not allowed for this audience — body reset to pending placeholder. See violations in this history entry.",
      },
    ];

    const { error: upErr } = await supabase
      .from("drafts")
      .update({
        body,
        instruction_history: nextHistory,
      })
      .eq("id", params.draftAttempt.draftId);

    if (upErr) {
      return { applied: false, reason: `draft_update_failed:${upErr.message}` };
    }

    return {
      applied: true,
      draftId: params.draftAttempt.draftId,
      auditPassed: false,
      violations: leakAudit.violations,
      escalationId,
    };
  }

  const nextHistory = [
    ...prior,
    personaStep,
    {
      step: "v3_output_auditor_commercial_terms",
      passed: true,
    },
    { step: "v3_output_auditor_planner_private_leakage", passed: true },
  ];

  const { error: upErr } = await supabase
    .from("drafts")
    .update({
      body: structured.email_draft,
      instruction_history: nextHistory,
    })
    .eq("id", params.draftAttempt.draftId);

  if (upErr) {
    return { applied: false, reason: `draft_update_failed:${upErr.message}` };
  }

  return { applied: true, draftId: params.draftAttempt.draftId, auditPassed: true };
}
