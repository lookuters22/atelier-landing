/**
 * Phase 2 Slice A1 — deterministic structured candidate actions for `clientOrchestratorV1`.
 * No prompts, no DB, no sends — shapes proposals from context + heuristics only.
 */
import type {
  BroadcastRiskLevel,
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
  InboundSenderIdentity,
  OrchestratorClientActionFamily,
  OrchestratorContextInjection,
  OrchestratorProposalCandidate,
  OrchestratorProposalLikelyOutcome,
  PlaybookRuleContextRow,
  ThreadDraftsSummary,
} from "../../../../src/types/decisionContext.types.ts";
import { formatOrchestratorContextInjectionRationaleSuffix } from "./buildOrchestratorSupportingContextInjection.ts";
import {
  describeComplianceAssetLibraryKey,
  resolveComplianceAssetLibraryKey,
} from "./complianceAssetLibraryAttach.ts";
import {
  BANKING_COMPLIANCE_EXCEPTION_BLOCKER,
  detectBankingComplianceOrchestratorException,
} from "./detectBankingComplianceOrchestratorException.ts";
import {
  detectVisualAssetVerificationOrchestratorRequest,
  VISUAL_ASSET_VERIFICATION_BLOCKER,
  VISUAL_ASSET_VERIFICATION_HOLD_RATIONALE,
} from "./detectVisualAssetVerificationOrchestratorRequest.ts";
import type { WeddingCrmParityHints } from "../context/weddingCrmParityHints.ts";
import {
  IDENTITY_THREAD_MULTI_WEDDING_BLOCKER,
  isThreadWeddingIdentityAmbiguous,
} from "../context/threadWeddingIdentityAmbiguous.ts";
import type { V3ThreadWorkflowV1 } from "../workflow/v3ThreadWorkflowTypes.ts";
import { detectNonCommercialOrchestratorRisk } from "./detectNonCommercialOrchestratorRisk.ts";
import {
  detectIdentityEntityRoutingAmbiguity,
  IDENTITY_ENTITY_AMBIGUITY_BLOCKER,
} from "./detectIdentityEntityRoutingAmbiguity.ts";
import {
  AUTHORITY_POLICY_BLOCKER,
  detectAuthorityPolicyRisk,
} from "./detectAuthorityPolicyRisk.ts";
import type { AuthorityMemoryRow } from "./detectMultiActorAuthorityRefinement.ts";
import {
  detectIrregularSettlementOrchestratorRequest,
  IRREGULAR_SETTLEMENT_BLOCKER,
} from "./detectIrregularSettlementOrchestratorRequest.ts";
import {
  detectHighMagnitudeClientConcessionOrchestratorRequest,
  HIGH_MAGNITUDE_CLIENT_CONCESSION_BLOCKER,
} from "./detectHighMagnitudeClientConcessionOrchestratorRequest.ts";
import {
  detectSensitivePersonalDocumentOrchestratorRequest,
  SENSITIVE_PERSONAL_DOCUMENT_BLOCKER,
} from "./detectSensitivePersonalDocumentOrchestratorRequest.ts";
import {
  detectStrategicTrustRepairOrchestratorRequest,
  STRATEGIC_TRUST_REPAIR_BLOCKER,
} from "./detectStrategicTrustRepairOrchestratorRequest.ts";

const DEFAULT_INBOUND_SENDER_AUTHORITY: InboundSenderAuthoritySnapshot = {
  bucket: "unknown",
  personId: null,
  isApprovalContact: false,
  source: "unresolved",
};

/**
 * Structured blocker code surfaced on `send_message` proposals when the
 * decision context classifies the latest inbound as promo / system / non-client.
 * The verdict suffix lets downstream audit tools quickly see which bucket fired
 * (e.g. `inbound_suppressed_non_client:promotional_or_marketing`).
 */
export const INBOUND_SUPPRESSED_NON_CLIENT_BLOCKER = "inbound_suppressed_non_client";

/**
 * No CRM inquiry/booking linked for this orchestrator turn — routine Ana client `send_message`
 * must not be draftable until the operator files or links the thread (needs filing / unfiled).
 */
export const NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER = "no_booking_context_for_client_reply";

/**
 * When true, routine client `send_message` must not be draftable — durable workflow state
 * already covers the thread (timeline elsewhere, wire-chase window, stalled nudge window).
 * Matches the same conditions as `sendMessageBlockers` workflow entries.
 */
export function workflowBlocksRoutineClientSendMessage(
  wf: V3ThreadWorkflowV1 | null | undefined,
): boolean {
  if (!wf) return false;
  if (wf.timeline?.suppressed === true) return true;
  if (wf.payment_wire?.chase_due_at) return true;
  if (wf.stalled_inquiry?.nudge_due_at) return true;
  return false;
}

export type ClientOrchestratorExecutionMode =
  | "auto"
  | "draft_only"
  | "ask_first"
  | "forbidden";

export type ClientOrchestratorProposalInput = {
  audience: DecisionAudienceSnapshot;
  playbookRules: PlaybookRuleContextRow[];
  selectedMemoriesCount: number;
  globalKnowledgeCount: number;
  escalationOpenCount: number;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web";
  rawMessage: string;
  requestedExecutionMode: ClientOrchestratorExecutionMode;
  /** A4 — thread-scoped pending draft facts (null = no thread / N/A). */
  threadDraftsSummary: ThreadDraftsSummary | null;
  /** A4 — compact CRM hints; pause flags gate outbound-style proposals conservatively. */
  weddingCrmParityHints: WeddingCrmParityHints | null;
  /** Bounded thread summary + recent message text for Phase 4.1 non-commercial heuristics (optional). */
  threadContextSnippet?: string;
  /** Durable workflow state from `v3_thread_workflow_state` (optional). */
  v3ThreadWorkflow?: V3ThreadWorkflowV1 | null;
  /** Distinct wedding ids linked to this thread (`thread_weddings` / DecisionContext). */
  candidateWeddingIds?: string[];
  /** Ingress sender identity (mirrors `DecisionContext.inboundSenderIdentity`). */
  inboundSenderIdentity?: InboundSenderIdentity | null;
  /** Sender authority snapshot (mirrors `DecisionContext.inboundSenderAuthority`). */
  inboundSenderAuthority?: InboundSenderAuthoritySnapshot;
  /**
   * When set (production path), merged into primary `send_message` and playbook rationales.
   * Tests omit — no suffix, unchanged behavior.
   */
  contextInjection?: OrchestratorContextInjection | null;
  /** Multi-actor authority refinement — mirrors hydrated memories for AP1 + verify-note scan. */
  selectedMemorySummaries?: readonly AuthorityMemoryRow[];
};

/**
 * Aligns with `executeToolVerifier` + `clientOrchestratorV1.mapOutcome`:
 * high broadcast risk + `auto` → verifier returns failure → runtime outcome **block** (not ask).
 */
function inferLikelyOutcome(
  mode: ClientOrchestratorExecutionMode,
  broadcastRisk: BroadcastRiskLevel,
  ruleDecisionMode: string | null | undefined,
): OrchestratorProposalLikelyOutcome {
  if (mode === "forbidden") return "block";
  if (ruleDecisionMode === "forbidden") return "block";
  if (broadcastRisk === "high" && mode === "auto") return "block";
  if (mode === "draft_only" || ruleDecisionMode === "draft_only") return "draft";
  if (mode === "ask_first" || ruleDecisionMode === "ask_first") return "ask";
  return "auto";
}

function playbookFamilyFromRule(rule: PlaybookRuleContextRow): OrchestratorClientActionFamily {
  const ak = (rule.action_key ?? "").toLowerCase();
  const families = [
    "send_message",
    "schedule_call",
    "move_call",
    "share_document",
    "update_crm",
    "operator_notification_routing",
  ] as const;
  if (families.includes(ak as OrchestratorClientActionFamily)) {
    return ak as OrchestratorClientActionFamily;
  }
  if (ak.includes("schedule") || ak.includes("calendar")) return "schedule_call";
  if (ak.includes("move_call") || (ak.includes("move") && ak.includes("call"))) return "move_call";
  if (ak.includes("share") || ak.includes("document")) return "share_document";
  if (ak.includes("crm") || ak.includes("stage") || ak.includes("wedding")) return "update_crm";
  if (ak.includes("operator") || ak.includes("routing") || ak.includes("notify")) {
    return "operator_notification_routing";
  }
  return "send_message";
}

function channelLabel(ch: "email" | "web"): string {
  return ch === "web" ? "web widget" : "email";
}

/**
 * Deterministic proposal list: primary reply path, policy/escalation routing, keyword hints, playbook rows.
 */
export function proposeClientOrchestratorCandidateActions(
  input: ClientOrchestratorProposalInput,
): OrchestratorProposalCandidate[] {
  const {
    audience,
    playbookRules,
    selectedMemoriesCount,
    globalKnowledgeCount,
    escalationOpenCount,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    requestedExecutionMode,
    threadDraftsSummary,
    weddingCrmParityHints,
    threadContextSnippet,
    v3ThreadWorkflow,
    candidateWeddingIds = [],
    inboundSenderIdentity = null,
    inboundSenderAuthority: inboundSenderAuthorityInput,
    contextInjection = null,
    selectedMemorySummaries = [],
  } = input;

  const inboundSenderAuthority = inboundSenderAuthorityInput ?? DEFAULT_INBOUND_SENDER_AUTHORITY;

  const orchestratorContextRationaleSuffix =
    contextInjection === null || contextInjection === undefined
      ? ""
      : ` ${formatOrchestratorContextInjectionRationaleSuffix(contextInjection)}`;

  const identityAmbiguous = isThreadWeddingIdentityAmbiguous({ threadId, candidateWeddingIds });

  const isr = detectIrregularSettlementOrchestratorRequest(rawMessage, threadContextSnippet);
  const bc = detectBankingComplianceOrchestratorException(rawMessage, threadContextSnippet);
  const vac = detectVisualAssetVerificationOrchestratorRequest(rawMessage, threadContextSnippet);
  const spd = detectSensitivePersonalDocumentOrchestratorRequest(rawMessage, threadContextSnippet);
  /** AP1 uses current inbound only for commercial / ambiguous-approval; snippet does not escalate alone. */
  const ap1 = detectAuthorityPolicyRisk({
    rawMessage,
    threadContextSnippet,
    authority: inboundSenderAuthority,
    selectedMemorySummaries,
    audience,
  });
  const ccm = detectHighMagnitudeClientConcessionOrchestratorRequest({
    rawMessage,
    threadContextSnippet,
    authority: inboundSenderAuthority,
  });
  const str = detectStrategicTrustRepairOrchestratorRequest(rawMessage, threadContextSnippet);
  const nc = detectNonCommercialOrchestratorRisk(rawMessage, threadContextSnippet);
  const ie2 = detectIdentityEntityRoutingAmbiguity({
    rawMessage,
    threadContextSnippet,
    threadId,
    candidateWeddingIds,
    inboundSenderEmail: inboundSenderIdentity?.email ?? undefined,
  });

  const text = rawMessage.trim().toLowerCase();
  const aud = audience;
  const likelyPrimary = inferLikelyOutcome(
    requestedExecutionMode,
    aud.broadcastRisk,
    null,
  );

  const blockers: string[] = [];
  if (!threadId) blockers.push("thread_id_missing");
  const missingBookingContextForClientReply =
    weddingId == null || (typeof weddingId === "string" && weddingId.trim().length === 0);
  if (missingBookingContextForClientReply) {
    blockers.push("wedding_id_missing_some_crm_and_thread_scoped_actions");
    blockers.push(NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER);
  }

  const pendingApprovalCount = threadDraftsSummary?.pendingApprovalCount ?? 0;
  const hasPendingApprovalDrafts = pendingApprovalCount > 0;
  const crmPauseActive =
    weddingCrmParityHints !== null &&
    (weddingCrmParityHints.strategicPause === true ||
      weddingCrmParityHints.compassionPause === true);

  const sendMessageBlockers = [...blockers];
  if (hasPendingApprovalDrafts) {
    sendMessageBlockers.push("thread_has_drafts_pending_approval");
  }
  if (crmPauseActive) {
    sendMessageBlockers.push("crm_operational_pause_active");
  }

  const wf = v3ThreadWorkflow ?? null;
  if (wf?.timeline?.suppressed) {
    sendMessageBlockers.push(
      `workflow_timeline_suppressed_other_channel:${wf.timeline.received_channel ?? "unknown"}`,
    );
  }
  if (wf?.payment_wire?.chase_due_at) {
    sendMessageBlockers.push(`workflow_payment_wire_chase_due_at:${wf.payment_wire.chase_due_at}`);
  }
  if (wf?.stalled_inquiry?.nudge_due_at) {
    sendMessageBlockers.push(`workflow_stalled_inquiry_nudge_due_at:${wf.stalled_inquiry.nudge_due_at}`);
  }
  if (identityAmbiguous) {
    sendMessageBlockers.push(IDENTITY_THREAD_MULTI_WEDDING_BLOCKER);
  }
  if (isr.hit) {
    sendMessageBlockers.push(IRREGULAR_SETTLEMENT_BLOCKER);
  }
  if (bc.hit) {
    sendMessageBlockers.push(BANKING_COMPLIANCE_EXCEPTION_BLOCKER);
  }
  if (vac.hit) {
    sendMessageBlockers.push(VISUAL_ASSET_VERIFICATION_BLOCKER);
  }
  if (spd.hit) {
    sendMessageBlockers.push(SENSITIVE_PERSONAL_DOCUMENT_BLOCKER);
  }
  if (ie2.hit) {
    sendMessageBlockers.push(IDENTITY_ENTITY_AMBIGUITY_BLOCKER);
  }
  if (ap1.hit) {
    sendMessageBlockers.push(AUTHORITY_POLICY_BLOCKER);
  }
  if (ccm.hit) {
    sendMessageBlockers.push(HIGH_MAGNITUDE_CLIENT_CONCESSION_BLOCKER);
  }
  if (str.hit) {
    sendMessageBlockers.push(STRATEGIC_TRUST_REPAIR_BLOCKER);
  }

  /**
   * Inbound suppression — promo / system / non-client mail (Booking.com campaigns,
   * newsletters, do-not-reply notifications, OTA blasts). When the decision
   * context's audience snapshot carries a `suppressed` classification for the
   * latest inbound message, a routine client `send_message` must not proceed.
   * We add a deterministic blocker + force `likely_outcome` to `"block"` so the
   * verifier/runtime returns the same `block` mapping as other policy gates.
   */
  const inboundSuppression = aud.inboundSuppression ?? null;
  const inboundSuppressed = inboundSuppression?.suppressed === true;
  if (inboundSuppressed && inboundSuppression) {
    sendMessageBlockers.push(
      `${INBOUND_SUPPRESSED_NON_CLIENT_BLOCKER}:${inboundSuppression.verdict}`,
    );
  }

  /** Pending approval on-thread: do not treat another client reply as safely `auto` when mode is `auto`. */
  let sendMessageLikely: OrchestratorProposalLikelyOutcome = likelyPrimary;
  if (
    hasPendingApprovalDrafts &&
    requestedExecutionMode === "auto" &&
    likelyPrimary === "auto"
  ) {
    sendMessageLikely = "draft";
  } else if (
    crmPauseActive &&
    requestedExecutionMode === "auto" &&
    likelyPrimary === "auto"
  ) {
    /** Pause flags: deterministic downgrade so outbound is not classed as routine auto-send. */
    sendMessageLikely = "ask";
  }

  const wfBlocksSend = workflowBlocksRoutineClientSendMessage(wf);
  if (wfBlocksSend) {
    /** V3 workflow: suppress orchestrator client draft for routine reply — state machine owns follow-up. */
    sendMessageLikely = "block";
  }
  if (identityAmbiguous) {
    sendMessageLikely = "block";
  }
  if (isr.hit) {
    sendMessageLikely = "block";
  }
  if (bc.hit) {
    sendMessageLikely = "block";
  }
  if (vac.hit) {
    sendMessageLikely = "block";
  }
  if (spd.hit) {
    sendMessageLikely = "block";
  }
  if (ie2.hit) {
    sendMessageLikely = "block";
  }
  if (ap1.hit) {
    sendMessageLikely = "block";
  }
  if (ccm.hit) {
    sendMessageLikely = "block";
  }
  if (str.hit) {
    sendMessageLikely = "block";
  }
  if (inboundSuppressed) {
    sendMessageLikely = "block";
  }
  if (missingBookingContextForClientReply) {
    sendMessageLikely = "block";
  }

  let sendMessageRationale =
    `Draft or send a client-appropriate reply on ${channelLabel(replyChannel)}; align with playbook and decision mode (${requestedExecutionMode}).`;
  if (hasPendingApprovalDrafts) {
    sendMessageRationale += ` Thread already has ${pendingApprovalCount} draft(s) pending approval — resolve or supersede before treating a new reply as auto-send.`;
  }
  if (crmPauseActive) {
    sendMessageRationale +=
      " CRM pause flag is active on this wedding — outbound client messaging should not proceed as routine auto execution.";
  }
  if (wfBlocksSend) {
    sendMessageRationale +=
      " V3 workflow state suppresses a routine client reply draft here (timeline/wire-chase/stalled window — use CRM/operator/sweep paths).";
  }
  if (identityAmbiguous) {
    sendMessageRationale +=
      " This thread is linked to more than one wedding — a confident routine reply is blocked until the active booking is clear (use operator routing or the disambiguation draft).";
  }
  if (isr.hit) {
    sendMessageRationale +=
      " Irregular settlement / tax-avoidance-shaped request detected (routing gate only, not a legal determination) — do not treat as a routine client reply; use operator routing (see irregular_settlement_reason_code on proposals).";
  }
  if (bc.hit) {
    sendMessageRationale +=
      " Banking or compliance exception detected — do not treat as a routine client reply; use operator/compliance routing (see banking_compliance_reason_code on proposals).";
  }
  if (vac.hit) {
    sendMessageRationale +=
      " Visual or attachment verification requested — the model cannot inspect the file; use operator routing and human review (see visual_asset_verification_reason_code on proposals).";
  }
  if (spd.hit) {
    sendMessageRationale +=
      " Sensitive identity-document or government-ID handling detected — not a routine client reply path; use operator/manual channel (see sensitive_personal_document_reason_code on proposals).";
  }
  if (ie2.hit) {
    sendMessageRationale +=
      " Identity/entity routing ambiguity (Phase 2) — do not treat as a confident routine reply until booking/entity context is clear (see identity_entity_phase2_reason_code on proposals).";
  }
  if (ap1.hit) {
    sendMessageRationale +=
      " Authority policy — do not treat as a routine binding commercial or approval reply until role is clear (see authority_policy_reason_code on proposals).";
  }
  if (ccm.hit) {
    sendMessageRationale +=
      " High-magnitude client/payer concession request — routing gate only (not a pricing decision); use operator routing (see high_magnitude_client_concession_reason_code on proposals).";
  }
  if (str.hit) {
    sendMessageRationale +=
      " Contradiction or expectation-mismatch / credibility-risk thread — not a routine primary reply path; use operator routing (see strategic_trust_repair_reason_code on proposals).";
  }
  if (inboundSuppressed && inboundSuppression) {
    const reasons = inboundSuppression.reasons.slice(0, 5).join(", ") || "none";
    sendMessageRationale +=
      ` Inbound message was classified as ${inboundSuppression.verdict} (confidence=${inboundSuppression.confidence}, reasons=[${reasons}]) — do not draft a client reply; promotional / system / non-client mail must route to operator attention only.`;
  }
  if (missingBookingContextForClientReply) {
    sendMessageRationale +=
      " No inquiry/booking project is linked for this thread yet (needs filing) — do not draft a routine client reply until the operator files or links it to the correct project.";
  }

  sendMessageRationale += orchestratorContextRationaleSuffix;

  const proposals: OrchestratorProposalCandidate[] = [];

  let seq = 0;
  const nextId = (slug: string) => `cand-${++seq}-${slug}`;

  const needsOperatorRouting =
    aud.agencyCcLock === true ||
    aud.broadcastRisk === "high" ||
    escalationOpenCount > 0 ||
    inboundSuppressed ||
    missingBookingContextForClientReply;

  const operatorLikely = inferLikelyOutcome(requestedExecutionMode, aud.broadcastRisk, null);

  if (isr.hit) {
    const isrc = isr.primaryClass;
    const isrCode = isr.escalation_reason_code;
    const humanIsr = isrc.replace(/_/g, " ");
    let opRationaleIsr =
      `Potentially improper settlement or tax-avoidance-shaped request (${humanIsr}): route to operator before a routine client reply — routing/safety gate only, not a legal conclusion; irregular_settlement_reason_code=${isrCode}.`;
    if (needsOperatorRouting) {
      opRationaleIsr += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_isr"),
      action_family: "operator_notification_routing",
      action_key: "v3_irregular_settlement_exception",
      rationale: opRationaleIsr,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      irregular_settlement_class: isrc,
      irregular_settlement_reason_code: isrCode,
    });

    const isrBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Irregular settlement gate (${humanIsr}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: isrBlockers,
      irregular_settlement_class: isrc,
      irregular_settlement_reason_code: isrCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (bc.hit) {
    const bcc = bc.primaryClass;
    const bcCode = bc.escalation_reason_code;
    const humanBc = bcc.replace(/_/g, " ");
    const capKey =
      bcc === "compliance_document_request"
        ? resolveComplianceAssetLibraryKey(rawMessage, threadContextSnippet)
        : null;
    const bcOperatorActionKey = capKey ? "v3_compliance_asset_library_attach" : "v3_banking_compliance_exception";
    let opRationaleBc =
      `Deterministic banking/compliance exception (${humanBc}): route to operator before a routine client reply; banking_compliance_reason_code=${bcCode}.`;
    if (capKey) {
      const hint = describeComplianceAssetLibraryKey(capKey);
      opRationaleBc += ` Compliance asset library (${capKey}): ${hint.operator_label} — operator should attach standard stored artifact (${hint.storage_hint}).`;
    }
    if (needsOperatorRouting) {
      opRationaleBc += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_bc"),
      action_family: "operator_notification_routing",
      action_key: bcOperatorActionKey,
      rationale: opRationaleBc,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      banking_compliance_class: bcc,
      banking_compliance_reason_code: bcCode,
      ...(capKey ? { compliance_asset_library_key: capKey } : {}),
    });

    const bcBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Banking/compliance exception (${humanBc}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: bcBlockers,
      banking_compliance_class: bcc,
      banking_compliance_reason_code: bcCode,
      ...(capKey ? { compliance_asset_library_key: capKey } : {}),
    });
    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (vac.hit) {
    const vcc = vac.primaryClass;
    const vCode = vac.escalation_reason_code;
    const humanVac = vcc.replace(/_/g, " ");
    let opRationaleVac =
      `Deterministic visual/attachment verification (${humanVac}): route to operator before a routine client reply; visual_asset_verification_reason_code=${vCode}.`;
    if (needsOperatorRouting) {
      opRationaleVac += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_vav"),
      action_family: "operator_notification_routing",
      action_key: "v3_visual_asset_verification",
      rationale: opRationaleVac,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      visual_asset_verification_class: vcc,
      visual_asset_verification_reason_code: vCode,
    });

    const vacBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Visual/attachment verification (${humanVac}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: vacBlockers,
      visual_asset_verification_class: vcc,
      visual_asset_verification_reason_code: vCode,
    });

    proposals.push({
      id: nextId("send_message_visual_hold"),
      action_family: "send_message",
      action_key: "v3_visual_asset_verification_hold",
      rationale: VISUAL_ASSET_VERIFICATION_HOLD_RATIONALE,
      verifier_gating_required: true,
      likely_outcome: "ask",
      blockers_or_missing_facts: [],
      visual_asset_verification_class: vcc,
      visual_asset_verification_reason_code: vCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (spd.hit) {
    const spdc = spd.primaryClass;
    const spdCode = spd.escalation_reason_code;
    const humanSpd = spdc.replace(/_/g, " ");
    let opRationaleSpd =
      `Sensitive identity-document / government-ID handling (${humanSpd}): route to operator or manual channel before a routine client reply; sensitive_personal_document_reason_code=${spdCode}.`;
    if (needsOperatorRouting) {
      opRationaleSpd += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_spd"),
      action_family: "operator_notification_routing",
      action_key: "v3_sensitive_personal_document_handling",
      rationale: opRationaleSpd,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      sensitive_personal_document_class: spdc,
      sensitive_personal_document_reason_code: spdCode,
    });

    const spdBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Sensitive identity-document gate (${humanSpd}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: spdBlockers,
      sensitive_personal_document_class: spdc,
      sensitive_personal_document_reason_code: spdCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (ap1.hit) {
    const apc = ap1.primaryClass;
    const apCode = ap1.escalation_reason_code;
    const humanAp = apc.replace(/_/g, " ");
    let opRationaleAp =
      `Deterministic authority policy (${humanAp}): route to operator before a routine client reply; authority_policy_reason_code=${apCode}.`;
    if (needsOperatorRouting) {
      opRationaleAp += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_ap1"),
      action_family: "operator_notification_routing",
      action_key: "v3_authority_policy_risk",
      rationale: opRationaleAp,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      authority_policy_class: apc,
      authority_policy_reason_code: apCode,
    });

    const ap1Blockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Authority policy (${humanAp}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: ap1Blockers,
      authority_policy_class: apc,
      authority_policy_reason_code: apCode,
    });

    const authorityClarificationRationale =
      apc === "multi_actor_planner_timeline_reduction_signer"
        ? "Clarification-focused reply: acknowledge the planner's schedule note; explicitly ask the couple and/or the named approval contact (signer) to confirm the timeline change before treating it as final for the team or file. CC visibility is not approval."
        : apc === "multi_actor_payer_scope_spend_signer"
          ? "Clarification-focused reply: do not auto-confirm add-on hours, fees, or scope from payer status alone; confirm signer/approval-contact sign-off per policy and any loaded verify-note before binding pricing or schedule."
          : "Clarification-only reply: confirm who is authorized to approve or change commercial/payment terms on this booking, or route to the named approval contact — do not bind pricing or contract changes from an unclear role.";

    proposals.push({
      id: nextId("send_message_authority_clarification"),
      action_family: "send_message",
      action_key: "v3_authority_policy_clarification",
      rationale: authorityClarificationRationale,
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: [],
      authority_policy_class: apc,
      authority_policy_reason_code: apCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (ccm.hit) {
    const ccmc = ccm.primaryClass;
    const ccmCode = ccm.escalation_reason_code;
    const humanCcm = ccmc.replace(/_/g, " ");
    let opRationaleCcm =
      `High-magnitude commercial concession from client/payer (${humanCcm}): route to operator before a routine reply — not an authority-role issue; high_magnitude_client_concession_reason_code=${ccmCode}.`;
    if (needsOperatorRouting) {
      opRationaleCcm += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_ccm"),
      action_family: "operator_notification_routing",
      action_key: "v3_high_magnitude_client_concession",
      rationale: opRationaleCcm,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      high_magnitude_client_concession_class: ccmc,
      high_magnitude_client_concession_reason_code: ccmCode,
    });

    const ccmBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} High-magnitude client concession (${humanCcm}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: ccmBlockers,
      high_magnitude_client_concession_class: ccmc,
      high_magnitude_client_concession_reason_code: ccmCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (str.hit) {
    const strc = str.primaryClass;
    const strCode = str.escalation_reason_code;
    const humanStr = strc.replace(/_/g, " ");
    let opRationaleStr =
      `Contradiction / expectation repair / credibility-risk thread (${humanStr}): route to operator before a routine client reply; strategic_trust_repair_reason_code=${strCode}.`;
    if (needsOperatorRouting) {
      opRationaleStr += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_str"),
      action_family: "operator_notification_routing",
      action_key: "v3_strategic_trust_repair",
      rationale: opRationaleStr,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      strategic_trust_repair_class: strc,
      strategic_trust_repair_reason_code: strCode,
    });

    const strBlockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Strategic trust-repair gate (${humanStr}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: strBlockers,
      strategic_trust_repair_class: strc,
      strategic_trust_repair_reason_code: strCode,
    });

    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (nc.hit) {
    const rc = nc.primaryClass;
    const code = nc.escalation_reason_code;
    const humanClass = rc.replace(/_/g, " ");
    let opRationale =
      `Deterministic non-commercial risk (${humanClass}): route to operator before a routine client reply; escalation_reason_code=${code}.`;
    if (needsOperatorRouting) {
      opRationale += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_nc"),
      action_family: "operator_notification_routing",
      action_key: "operator_notification_routing",
      rationale: opRationale,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      risk_class: rc,
      escalation_reason_code: code,
    });

    const ncBlockers = [
      ...sendMessageBlockers,
      `non_commercial_high_risk:${code}`,
      "routine_client_reply_blocked_as_primary_path_non_commercial_escalation_heuristics",
    ];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Non-commercial risk detected (${humanClass}) — do not treat as an ordinary primary send; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: ncBlockers,
      risk_class: rc,
      escalation_reason_code: code,
    });
    if (identityAmbiguous) {
      proposals.push({
        id: nextId("send_message_disambiguation"),
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale:
          "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
        verifier_gating_required: true,
        likely_outcome: likelyPrimary,
        blockers_or_missing_facts: [],
      });
    }
  } else if (ie2.hit) {
    const iec = ie2.primaryClass;
    const ieCode = ie2.escalation_reason_code;
    const humanIe = iec.replace(/_/g, " ");
    let opRationaleIe =
      `Deterministic identity/entity ambiguity (${humanIe}): route to operator before a routine client reply; identity_entity_phase2_reason_code=${ieCode}.`;
    if (needsOperatorRouting) {
      opRationaleIe += ` Additional routing context: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`;
    }
    proposals.push({
      id: nextId("operator_notification_routing_ie2"),
      action_family: "operator_notification_routing",
      action_key: "v3_identity_entity_routing_ambiguity",
      rationale: opRationaleIe,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      identity_entity_phase2_class: iec,
      identity_entity_phase2_reason_code: ieCode,
    });

    const ie2Blockers = [...sendMessageBlockers];
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: `${sendMessageRationale} Identity/entity ambiguity (${humanIe}) — routine primary send blocked; operator routing precedes.`,
      verifier_gating_required: true,
      likely_outcome: "block",
      blockers_or_missing_facts: ie2Blockers,
      identity_entity_phase2_class: iec,
      identity_entity_phase2_reason_code: ieCode,
    });

    proposals.push({
      id: nextId("send_message_identity_entity_clarification"),
      action_family: "send_message",
      action_key: "v3_identity_entity_clarification",
      rationale:
        "Clarification-only reply: ask which booking, wedding, or entity context applies (B2B sender vs couple, or which event when multiple are mentioned). Do not confirm amounts, dates, or identity as certain until routing is clear.",
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: [],
      identity_entity_phase2_class: iec,
      identity_entity_phase2_reason_code: ieCode,
    });
  } else if (identityAmbiguous) {
    const identityOpRationale = needsOperatorRouting
      ? "Multi-wedding thread: this conversation is linked to more than one wedding in CRM — confirm which booking applies before confident client replies. " +
        `Surface or route via operator notification path: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`
      : "Multi-wedding thread: this conversation is linked to more than one wedding in CRM — route to operator to confirm which booking applies before routine client replies.";
    proposals.push({
      id: nextId("operator_notification_routing"),
      action_family: "operator_notification_routing",
      action_key: needsOperatorRouting ? "operator_notification_routing" : "v3_multithread_wedding_identity",
      rationale: identityOpRationale,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts:
        escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
    });
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: sendMessageRationale,
      verifier_gating_required: true,
      likely_outcome: sendMessageLikely,
      blockers_or_missing_facts: sendMessageBlockers,
    });
    proposals.push({
      id: nextId("send_message_disambiguation"),
      action_family: "send_message",
      action_key: "v3_wedding_identity_disambiguation",
      rationale:
        "Disambiguation-only client reply: politely ask which wedding or booking the message refers to. Do not confirm invoices, amounts, or dates until identity is clear.",
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: [],
    });
  } else {
    proposals.push({
      id: nextId("send_message"),
      action_family: "send_message",
      action_key: "send_message",
      rationale: sendMessageRationale,
      verifier_gating_required: true,
      likely_outcome: sendMessageLikely,
      blockers_or_missing_facts: sendMessageBlockers,
    });

    if (needsOperatorRouting) {
      proposals.push({
        id: nextId("operator_notification_routing"),
        action_family: "operator_notification_routing",
        action_key: "operator_notification_routing",
        rationale:
          `Surface or route via operator notification path: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`,
        verifier_gating_required: true,
        likely_outcome: operatorLikely,
        blockers_or_missing_facts: escalationOpenCount > 0
          ? ["open_escalations_require_resolution_or_explicit_handling"]
          : [],
      });
    }
  }

  // Keyword heuristics (conservative — optional extra candidates).
  if (
    !str.hit &&
    /\b(schedule|calendar|book a call|meeting|zoom|facetime|availability)\b/.test(text)
  ) {
    proposals.push({
      id: nextId("schedule_call"),
      action_family: "schedule_call",
      action_key: "schedule_call",
      rationale: "Inbound content suggests scheduling or calendar coordination.",
      verifier_gating_required: true,
      likely_outcome:
        requestedExecutionMode === "auto" && aud.broadcastRisk !== "high"
          ? "draft"
          : likelyPrimary,
      blockers_or_missing_facts: !weddingId ? ["wedding_context_recommended_for_calendar_tools"] : [],
    });
  }

  if (
    !str.hit &&
    /\b(reschedule|move (?:our |the |your )?(?:call|meeting)|different time|new time)\b/.test(text)
  ) {
    proposals.push({
      id: nextId("move_call"),
      action_family: "move_call",
      action_key: "move_call",
      rationale: "Inbound content suggests moving or rescheduling a call.",
      verifier_gating_required: true,
      likely_outcome: likelyPrimary === "auto" ? "draft" : likelyPrimary,
      blockers_or_missing_facts: [],
    });
  }

  if (
    !spd.hit &&
    !str.hit &&
    /\b(brochure|pdf|contract|attachment|share (?:the |our )?(?:document|link|file))\b/.test(text)
  ) {
    proposals.push({
      id: nextId("share_document"),
      action_family: "share_document",
      action_key: "share_document",
      rationale: "Inbound content references documents, attachments, or shared files.",
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: [],
    });
  }

  if (
    !str.hit &&
    /\b(stage|booked|proposal|invoice|payment|deposit|balance|crm)\b/.test(text)
  ) {
    proposals.push({
      id: nextId("update_crm"),
      action_family: "update_crm",
      action_key: "update_crm",
      rationale: "Inbound content may imply CRM or commercial state updates (verify before write).",
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: !weddingId ? ["wedding_id_required_for_bounded_crm_updates"] : [],
    });
  }

  // V3 durable workflow — explicit CRM/operator follow-up windows (deterministic state; not prompt-only).
  if (
    !isr.hit &&
    !bc.hit &&
    !vac.hit &&
    !spd.hit &&
    !nc.hit &&
    !ie2.hit &&
    !ap1.hit &&
    !ccm.hit &&
    !str.hit &&
    wf?.payment_wire?.chase_due_at &&
    !wf.payment_wire.chase_task_created_at
  ) {
    proposals.push({
      id: nextId("update_crm_wire_chase"),
      action_family: "update_crm",
      action_key: "v3_wire_chase_scheduled",
      rationale: `Wire chase follow-up window active — chase_due_at=${wf.payment_wire.chase_due_at} (promised_at=${wf.payment_wire.promised_at ?? "unknown"}).`,
      verifier_gating_required: true,
      likely_outcome: likelyPrimary,
      blockers_or_missing_facts: !weddingId ? ["wedding_id_required_for_bounded_crm_updates"] : [],
    });
  }
  if (
    !isr.hit &&
    !bc.hit &&
    !vac.hit &&
    !spd.hit &&
    !nc.hit &&
    !ie2.hit &&
    !ap1.hit &&
    !ccm.hit &&
    !str.hit &&
    wf?.stalled_inquiry?.nudge_due_at &&
    !wf.stalled_inquiry.nudge_task_created_at
  ) {
    proposals.push({
      id: nextId("operator_stalled_nudge"),
      action_family: "operator_notification_routing",
      action_key: "v3_stalled_inquiry_nudge_scheduled",
      rationale: `Stalled communication nudge window — nudge_due_at=${wf.stalled_inquiry.nudge_due_at} (client_marked_at=${wf.stalled_inquiry.client_marked_at ?? "unknown"}).`,
      verifier_gating_required: true,
      likely_outcome: operatorLikely,
      blockers_or_missing_facts: [],
    });
  }

  // Playbook rows (tenant policy) — up to 5 active rules as additional keyed candidates.
  const activeRules = playbookRules.filter((r) => r.is_active !== false).slice(0, 5);
  for (const rule of activeRules) {
    const family = playbookFamilyFromRule(rule);
    let likely = inferLikelyOutcome(
      requestedExecutionMode,
      aud.broadcastRisk,
      rule.decision_mode,
    );
    /**
     * Playbook rows are primary policy; empty memory/KB is not a blocker (supporting context is optional).
     * Truth hierarchy: playbook_rules → case memory / global KB (supporting only).
     */
    let pbBlockers: string[] = [];
    if (
      family === "send_message" &&
      (wfBlocksSend ||
        identityAmbiguous ||
        isr.hit ||
        bc.hit ||
        vac.hit ||
        spd.hit ||
        nc.hit ||
        ie2.hit ||
        ap1.hit ||
        ccm.hit ||
        str.hit ||
        /**
         * Inbound suppression — promo / system / non-client thread. Without
         * this branch a playbook rule (e.g. "always send timeline note on
         * keyword X") could still produce a draftable `send_message` proposal
         * on a Booking.com promo thread, defeating the entire suppression
         * gate. Treat it identically to other safety hits: force `block`,
         * propagate the canonical blocker codes.
         */
        inboundSuppressed ||
        missingBookingContextForClientReply)
    ) {
      likely = "block";
      pbBlockers = [...pbBlockers, ...sendMessageBlockers.filter((b) => !pbBlockers.includes(b))];
    }
    proposals.push({
      id: nextId(`pb-${rule.id.slice(0, 8)}`),
      action_family: family,
      action_key: rule.action_key ?? family,
      rationale:
        `Playbook rule topic=${rule.topic ?? "unknown"}; channel=${rule.channel ?? "any"}; instruction excerpt: ${(rule.instruction ?? "").slice(0, 160)}${orchestratorContextRationaleSuffix}`,
      verifier_gating_required: true,
      likely_outcome: likely,
      blockers_or_missing_facts: pbBlockers,
      playbook_rule_ids: [rule.id],
    });
  }

  /**
   * `attemptOrchestratorDraft` selects the first non-block `send_message` by family alone — including
   * disambiguation / clarification keys. Without this pass, an unfiled thread could still get a client
   * draft from a secondary `send_message` even when the primary path is blocked for missing booking.
   */
  if (missingBookingContextForClientReply) {
    for (const p of proposals) {
      if (p.action_family !== "send_message") continue;
      const bf = p.blockers_or_missing_facts ?? [];
      const nextBlockers = bf.includes(NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER)
        ? bf
        : [...bf, NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER];
      p.likely_outcome = "block";
      p.blockers_or_missing_facts = nextBlockers;
    }
  }

  return proposals;
}
