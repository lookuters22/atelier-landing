/**
 * Phase 9 Step 9C — learning inputs from draft approval edits and rewrite feedback (`execute_v3.md`).
 *
 * Writes **memories** only (candidate signals). Does **not** create or update `playbook_rules`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { memoryScopeForWeddingBinding } from "./memory/memoryInsertScope.ts";
import {
  maybeRecordPatternMapReview,
  patternFingerprintForDraftLearning,
} from "./patternReviewGate.ts";

type ServiceClient = SupabaseClient;

async function afterLearningInsert(
  supabase: ServiceClient,
  params: { photographerId: string; weddingId: string | null; patternFp: string },
): Promise<void> {
  try {
    await maybeRecordPatternMapReview(supabase, params);
  } catch (e) {
    console.error("[9D] pattern review gate:", e);
  }
}

export type CaptureApprovalEditInput = {
  channel: "approval_edit";
  photographerId: string;
  weddingId: string | null;
  draftId: string;
  originalBody: string;
  editedBody: string;
};

export type CaptureRewriteFeedbackInput = {
  channel: "rewrite_feedback";
  photographerId: string;
  weddingId: string | null;
  draftId: string;
  feedback: string;
};

export type CaptureDraftLearningInput = CaptureApprovalEditInput | CaptureRewriteFeedbackInput;

/**
 * Persist a learning signal for Ana; explicit photographer confirmation required before any playbook promotion.
 */
export async function captureDraftLearningInput(
  supabase: ServiceClient,
  input: CaptureDraftLearningInput,
): Promise<void> {
  if (input.channel === "approval_edit") {
    if (input.originalBody.trim() === input.editedBody.trim()) return;

    const patternFp = await patternFingerprintForDraftLearning({
      channel: "approval_edit",
      originalBody: input.originalBody,
      editedBody: input.editedBody,
    });

    const title = "Draft approval edit (learning input)".slice(0, 120);
    const summary =
      "Photographer changed draft body before send — not auto-promoted to global rules.".slice(0, 400);
    const full_content = [
      "9C: learning_input / not_playbook_promoted",
      `pattern_fp:${patternFp}`,
      `draft_id: ${input.draftId}`,
      "",
      "original_body:",
      input.originalBody.slice(0, 6000),
      "",
      "edited_body:",
      input.editedBody.slice(0, 6000),
    ].join("\n");

    const { error } = await supabase.from("memories").insert({
      photographer_id: input.photographerId,
      wedding_id: input.weddingId,
      scope: memoryScopeForWeddingBinding(input.weddingId),
      type: "draft_approval_edit_learning",
      title,
      summary,
      full_content: full_content.slice(0, 8000),
    });

    if (error) throw new Error(`captureDraftLearningInput approval_edit: ${error.message}`);
    await afterLearningInsert(supabase, {
      photographerId: input.photographerId,
      weddingId: input.weddingId,
      patternFp,
    });
    return;
  }

  const fb = input.feedback.trim();
  if (!fb) return;

  const patternFp = await patternFingerprintForDraftLearning({
    channel: "rewrite_feedback",
    feedback: fb,
  });

  const title = "Draft rewrite feedback (learning input)".slice(0, 120);
  const summary = "Photographer feedback for rewrite — not auto-promoted to global rules.".slice(0, 400);
  const full_content = [
    "9C: learning_input / not_playbook_promoted",
    `pattern_fp:${patternFp}`,
    `draft_id: ${input.draftId}`,
    "",
    "feedback:",
    fb.slice(0, 7500),
  ].join("\n");

  const { error } = await supabase.from("memories").insert({
    photographer_id: input.photographerId,
    wedding_id: input.weddingId,
    scope: memoryScopeForWeddingBinding(input.weddingId),
    type: "draft_rewrite_feedback_learning",
    title,
    summary,
    full_content: full_content.slice(0, 8000),
  });

  if (error) throw new Error(`captureDraftLearningInput rewrite_feedback: ${error.message}`);
  await afterLearningInsert(supabase, {
    photographerId: input.photographerId,
    weddingId: input.weddingId,
    patternFp,
  });
}
