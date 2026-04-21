/**
 * Phase 9 Step 9D — review gate for repeated new patterns (`execute_v3.md`).
 *
 * Does **not** create category-map entries or new action families/topics/risk classes here.
 * Emits a **review candidate** memory only when the same pattern fingerprint appears across
 * ≥2 distinct weddings (and ≥2 signals) — never from a single thread/wedding alone.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { memoryScopeForWeddingBinding } from "./memory/memoryInsertScope.ts";

type ServiceClient = SupabaseClient;

const LEARNING_TYPES = ["draft_approval_edit_learning", "draft_rewrite_feedback_learning"] as const;

async function sha16(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Stable fingerprint for clustering similar draft-learning signals (not per-draft id). */
export async function patternFingerprintForDraftLearning(input: {
  channel: "approval_edit" | "rewrite_feedback";
  originalBody?: string;
  editedBody?: string;
  feedback?: string;
}): Promise<string> {
  if (input.channel === "approval_edit") {
    const a = (input.originalBody ?? "").slice(0, 800);
    const b = (input.editedBody ?? "").slice(0, 800);
    return sha16(`approval_edit|${a}|${b}`);
  }
  const fb = (input.feedback ?? "").trim().toLowerCase().slice(0, 500);
  return sha16(`rewrite_feedback|${fb}`);
}

/** Requires cross-wedding repetition; single-wedding bursts do not pass. */
export function evaluatePatternMapReviewGate(distinctWeddingCount: number, totalSignals: number): boolean {
  if (totalSignals < 2) return false;
  if (distinctWeddingCount < 2) return false;
  return true;
}

async function countPatternSignals(
  supabase: ServiceClient,
  photographerId: string,
  patternFp: string,
): Promise<{ total: number; distinctWeddingCount: number }> {
  const { data: rows, error } = await supabase
    .from("memories")
    .select("wedding_id")
    .eq("photographer_id", photographerId)
    .in("type", [...LEARNING_TYPES])
    .ilike("full_content", `%pattern_fp:${patternFp}%`);

  if (error) throw new Error(`patternReviewGate count: ${error.message}`);
  const list = rows ?? [];
  const total = list.length;
  const weddings = new Set(
    list.map((r) => r.wedding_id as string | null).filter((id): id is string => id != null && id !== ""),
  );
  return { total, distinctWeddingCount: weddings.size };
}

async function hasExistingReviewRow(
  supabase: ServiceClient,
  photographerId: string,
  patternFp: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("memories")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("type", "pattern_map_review_candidate")
    .ilike("full_content", `%pattern_review_fp:${patternFp}%`)
    .maybeSingle();

  if (error) throw new Error(`patternReviewGate review lookup: ${error.message}`);
  return !!data?.id;
}

/**
 * After a draft learning memory row is inserted, optionally add one review-candidate row
 * when cross-wedding threshold is met (9D).
 */
export async function maybeRecordPatternMapReview(
  supabase: ServiceClient,
  params: {
    photographerId: string;
    weddingId: string | null;
    patternFp: string;
  },
): Promise<void> {
  const { total, distinctWeddingCount } = await countPatternSignals(
    supabase,
    params.photographerId,
    params.patternFp,
  );

  if (!evaluatePatternMapReviewGate(distinctWeddingCount, total)) {
    return;
  }

  if (await hasExistingReviewRow(supabase, params.photographerId, params.patternFp)) {
    return;
  }

  const title = "Category map review — repeated pattern (9D)".slice(0, 120);
  const summary =
    `Same learning pattern across ${distinctWeddingCount} wedding(s), ${total} signal(s). Not a new category until reviewed.`.slice(
      0,
      400,
    );
  const full_content = [
    "9D: pattern_map_review_candidate",
    `pattern_review_fp:${params.patternFp}`,
    `distinct_weddings: ${distinctWeddingCount}`,
    `total_signals: ${total}`,
    "",
    "Consider: action family, topic, or verifier risk class — only after human review.",
  ].join("\n");

  const { error } = await supabase.from("memories").insert({
    photographer_id: params.photographerId,
    wedding_id: params.weddingId,
    scope: memoryScopeForWeddingBinding(params.weddingId),
    type: "pattern_map_review_candidate",
    title,
    summary,
    full_content: full_content.slice(0, 8000),
  });

  if (error) throw new Error(`patternReviewGate review insert: ${error.message}`);
}
