/**
 * Phase 9 Steps 9B / 9B.1 / 9E — writeback after answered escalation (`execute_v3.md`).
 *
 * 9B.1: `resolveStrictEscalationStorageTarget` picks exactly one of:
 * - playbook_rules (reusable, non-sensitive)
 * - memories (case-specific, non-sensitive)
 * - documents (sensitive/compliance; audit metadata links `escalation_request_id`)
 *
 * 9E: The resolution **prose** is stored in that primary row only (instruction, memory body, or document
 * metadata). `escalation_requests` is updated for status, links, and `resolution_storage_target`, not as a
 * second copy of the same text (see orchestrator: no `resolution_text` before writeback).
 *
 * Unresolved: orchestrator does not call this when the reply does not resolve the escalation (row stays open).
 */
import type { EscalationLearningOutcome } from "./classifyEscalationLearningOutcome.ts";
import {
  resolveStrictEscalationStorageTarget,
} from "./resolveStrictEscalationStorageTarget.ts";
import { supabaseAdmin } from "./supabase.ts";

type ServiceRoleClient = typeof supabaseAdmin;

export type WritebackEscalationLearningParams = {
  photographerId: string;
  escalationId: string;
  learningOutcome: EscalationLearningOutcome;
  reasonCode: string;
  actionKey: string;
  decisionJustification: unknown;
  weddingId: string | null;
  questionBody: string;
  resolutionSummary: string;
};

export type WritebackEscalationLearningResult =
  | { branch: "playbook"; playbookRuleId: string }
  | { branch: "memory"; memoryId: string }
  | { branch: "document"; documentId: string };

function topicFromAction(actionKey: string): string {
  const t = actionKey.replace(/_/g, " ").trim() || "escalation";
  return t.slice(0, 200);
}

export async function writebackEscalationLearning(
  supabase: ServiceRoleClient,
  p: WritebackEscalationLearningParams,
): Promise<WritebackEscalationLearningResult> {
  const target = resolveStrictEscalationStorageTarget({
    learningOutcome: p.learningOutcome,
    reasonCode: p.reasonCode,
    actionKey: p.actionKey,
    decisionJustification: p.decisionJustification,
  });

  if (target === "documents") {
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        photographer_id: p.photographerId,
        wedding_id: p.weddingId,
        kind: "other",
        title: `Escalation audit — ${topicFromAction(p.actionKey)}`.slice(0, 200),
        metadata: {
          audit: true,
          escalation_request_id: p.escalationId,
          resolution_text: p.resolutionSummary,
          question_body: p.questionBody,
          action_key: p.actionKey,
          learning_outcome: p.learningOutcome,
        },
      })
      .select("id")
      .single();

    if (docErr || !doc?.id) throw new Error(`documents insert: ${docErr?.message}`);

    const documentId = doc.id as string;

    const { error: escErr } = await supabase
      .from("escalation_requests")
      .update({
        resolution_storage_target: "documents",
        playbook_rule_id: null,
        promote_to_playbook: false,
      })
      .eq("id", p.escalationId)
      .eq("photographer_id", p.photographerId);

    if (escErr) throw new Error(`escalation_requests documents link: ${escErr.message}`);

    return { branch: "document", documentId };
  }

  if (target === "playbook_rules") {
    const instruction =
      `${p.resolutionSummary.trim()}\n\n(Source: operator escalation resolution.)`.slice(0, 8000);

    const { data: existing } = await supabase
      .from("playbook_rules")
      .select("id")
      .eq("photographer_id", p.photographerId)
      .eq("action_key", p.actionKey)
      .eq("scope", "global")
      .maybeSingle();

    let ruleId: string;

    if (existing?.id) {
      ruleId = existing.id as string;
      const { error: upErr } = await supabase
        .from("playbook_rules")
        .update({
          instruction,
          updated_at: new Date().toISOString(),
          source_type: "escalation_resolution",
          confidence_label: "explicit",
        })
        .eq("id", ruleId)
        .eq("photographer_id", p.photographerId);

      if (upErr) throw new Error(`playbook_rules update: ${upErr.message}`);
    } else {
      const { data: created, error: insErr } = await supabase
        .from("playbook_rules")
        .insert({
          photographer_id: p.photographerId,
          scope: "global",
          channel: null,
          action_key: p.actionKey,
          topic: topicFromAction(p.actionKey),
          decision_mode: "auto",
          instruction,
          source_type: "escalation_resolution",
          confidence_label: "explicit",
          is_active: true,
        })
        .select("id")
        .single();

      if (insErr || !created?.id) throw new Error(`playbook_rules insert: ${insErr?.message}`);
      ruleId = created.id as string;
    }

    const { error: escErr } = await supabase
      .from("escalation_requests")
      .update({
        playbook_rule_id: ruleId,
        promote_to_playbook: true,
        resolution_storage_target: "playbook_rules",
      })
      .eq("id", p.escalationId)
      .eq("photographer_id", p.photographerId);

    if (escErr) throw new Error(`escalation_requests playbook link: ${escErr.message}`);

    return { branch: "playbook", playbookRuleId: ruleId };
  }

  const title = `Case decision: ${topicFromAction(p.actionKey)}`.slice(0, 120);
  const summary = p.resolutionSummary.trim().slice(0, 400);
  const full = [
    `escalation_request_id: ${p.escalationId}`,
    `action_key: ${p.actionKey}`,
    "",
    "Question:",
    p.questionBody,
    "",
    "Resolution:",
    p.resolutionSummary,
  ].join("\n");

  const { data: mem, error: memErr } = await supabase
    .from("memories")
    .insert({
      photographer_id: p.photographerId,
      wedding_id: p.weddingId,
      type: "escalation_case_decision",
      title,
      summary,
      full_content: full.slice(0, 8000),
    })
    .select("id")
    .single();

  if (memErr || !mem?.id) throw new Error(`memories insert: ${memErr?.message}`);

  const { error: escErr } = await supabase
    .from("escalation_requests")
    .update({
      resolution_storage_target: "memories",
      playbook_rule_id: null,
      promote_to_playbook: false,
    })
    .eq("id", p.escalationId)
    .eq("photographer_id", p.photographerId);

  if (escErr) throw new Error(`escalation_requests memory link: ${escErr.message}`);

  return { branch: "memory", memoryId: mem.id as string };
}
