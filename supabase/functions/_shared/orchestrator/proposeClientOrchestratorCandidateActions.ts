/**
 * Phase 2 Slice A1 — deterministic structured candidate actions for `clientOrchestratorV1`.
 * No prompts, no DB, no sends — shapes proposals from context + heuristics only.
 */
import type {
  BroadcastRiskLevel,
  DecisionAudienceSnapshot,
  OrchestratorClientActionFamily,
  OrchestratorProposalCandidate,
  OrchestratorProposalLikelyOutcome,
  PlaybookRuleContextRow,
  ThreadDraftsSummary,
} from "../../../../src/types/decisionContext.types.ts";
import type { WeddingCrmParityHints } from "../context/weddingCrmParityHints.ts";

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
  } = input;

  const text = rawMessage.trim().toLowerCase();
  const aud = audience;
  const likelyPrimary = inferLikelyOutcome(
    requestedExecutionMode,
    aud.broadcastRisk,
    null,
  );

  const blockers: string[] = [];
  if (!threadId) blockers.push("thread_id_missing");
  if (!weddingId) blockers.push("wedding_id_missing_some_crm_and_thread_scoped_actions");

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

  let sendMessageRationale =
    `Draft or send a client-appropriate reply on ${channelLabel(replyChannel)}; align with playbook and decision mode (${requestedExecutionMode}).`;
  if (hasPendingApprovalDrafts) {
    sendMessageRationale += ` Thread already has ${pendingApprovalCount} draft(s) pending approval — resolve or supersede before treating a new reply as auto-send.`;
  }
  if (crmPauseActive) {
    sendMessageRationale +=
      " CRM pause flag is active on this wedding — outbound client messaging should not proceed as routine auto execution.";
  }

  const proposals: OrchestratorProposalCandidate[] = [];

  let seq = 0;
  const nextId = (slug: string) => `cand-${++seq}-${slug}`;

  // Primary client reply (always relevant when handling an inbound message).
  proposals.push({
    id: nextId("send_message"),
    action_family: "send_message",
    action_key: "send_message",
    rationale: sendMessageRationale,
    verifier_gating_required: true,
    likely_outcome: sendMessageLikely,
    blockers_or_missing_facts: sendMessageBlockers,
  });

  // Agency / broadcast / open escalations → operator lane consideration.
  const needsOperatorRouting =
    aud.agencyCcLock === true ||
    aud.broadcastRisk === "high" ||
    escalationOpenCount > 0;

  if (needsOperatorRouting) {
    proposals.push({
      id: nextId("operator_notification_routing"),
      action_family: "operator_notification_routing",
      action_key: "operator_notification_routing",
      rationale:
        `Surface or route via operator notification path: agencyCcLock=${String(aud.agencyCcLock)}, broadcastRisk=${aud.broadcastRisk}, openEscalations=${escalationOpenCount}.`,
      verifier_gating_required: true,
      likely_outcome: inferLikelyOutcome(
        requestedExecutionMode,
        aud.broadcastRisk,
        null,
      ),
      blockers_or_missing_facts: escalationOpenCount > 0
        ? ["open_escalations_require_resolution_or_explicit_handling"]
        : [],
    });
  }

  // Keyword heuristics (conservative — optional extra candidates).
  if (/\b(schedule|calendar|book a call|meeting|zoom|facetime|availability)\b/.test(text)) {
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

  if (/\b(reschedule|move (?:our |the |your )?(?:call|meeting)|different time|new time)\b/.test(text)) {
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

  if (/\b(brochure|pdf|contract|attachment|share (?:the |our )?(?:document|link|file))\b/.test(text)) {
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

  if (/\b(stage|booked|proposal|invoice|payment|deposit|balance|crm)\b/.test(text)) {
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

  // Playbook rows (tenant policy) — up to 5 active rules as additional keyed candidates.
  const activeRules = playbookRules.filter((r) => r.is_active !== false).slice(0, 5);
  for (const rule of activeRules) {
    const family = playbookFamilyFromRule(rule);
    const likely = inferLikelyOutcome(
      requestedExecutionMode,
      aud.broadcastRisk,
      rule.decision_mode,
    );
    proposals.push({
      id: nextId(`pb-${rule.id.slice(0, 8)}`),
      action_family: family,
      action_key: rule.action_key ?? family,
      rationale:
        `Playbook rule topic=${rule.topic ?? "unknown"}; channel=${rule.channel ?? "any"}; instruction excerpt: ${(rule.instruction ?? "").slice(0, 160)}`,
      verifier_gating_required: true,
      likely_outcome: likely,
      blockers_or_missing_facts:
        selectedMemoriesCount === 0 && globalKnowledgeCount === 0
          ? ["no_hydrated_memories_or_global_knowledge_rows_in_context"]
          : [],
      playbook_rule_ids: [rule.id],
    });
  }

  return proposals;
}
