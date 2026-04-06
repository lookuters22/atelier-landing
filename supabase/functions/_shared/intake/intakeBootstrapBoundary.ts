/**
 * Intake bootstrap boundary — **resolver first**, orchestrator later.
 *
 * Composes: `createIntakeLeadRecords` + optional `linkOriginThreadToIntakeWedding`.
 * Extraction lives in `intakeExtraction.ts` (`runIntakeExtractionAndResearch`).
 *
 * Grep: `IntakeBootstrapBoundaryOutput`
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createIntakeLeadRecords } from "../resolvers/createIntakeLeadRecords.ts";
import { linkOriginThreadToIntakeWedding } from "../resolvers/linkOriginThreadToIntakeWedding.ts";
import { runIntakeExtractionAndResearch } from "./intakeExtraction.ts";
import type {
  IntakeBootstrapBoundaryOutput,
  IntakeLeadCreationInput,
  IntakeLeadCreationResult,
  IntakeOriginThreadLinkInput,
} from "./intakeBootstrapTypes.ts";

export type {
  IntakeBootstrapBoundaryOutput,
  IntakeLeadCreationInput,
  IntakeLeadCreationResult,
  IntakeOriginThreadLinkInput,
  IntakeStructuredExtraction,
} from "./intakeBootstrapTypes.ts";

/**
 * Insert wedding + client + lead thread + first inbound message (existing resolver contract).
 */
export async function applyIntakeLeadCreation(
  supabase: SupabaseClient,
  input: IntakeLeadCreationInput,
): Promise<IntakeLeadCreationResult> {
  const { photographer_id, extraction, sender_email, raw_message } = input;
  return await createIntakeLeadRecords(supabase, {
    photographer_id,
    extraction: {
      couple_names: extraction.couple_names,
      wedding_date: extraction.wedding_date,
      location: extraction.location,
      story_notes: extraction.story_notes || null,
    },
    sender_email,
    raw_message,
  });
}

/**
 * Link triage origin thread to the new wedding when `origin_thread_id` is present.
 * Safe no-op when id is missing; delegates to `linkOriginThreadToIntakeWedding`.
 */
export async function applyIntakeOriginThreadLink(
  supabase: SupabaseClient,
  input: IntakeOriginThreadLinkInput,
): Promise<boolean> {
  if (!input.origin_thread_id?.trim()) {
    return false;
  }
  await linkOriginThreadToIntakeWedding(supabase, {
    photographer_id: input.photographer_id,
    origin_thread_id: input.origin_thread_id,
    new_wedding_id: input.new_wedding_id,
  });
  return true;
}

/**
 * Convenience bundle for tests and future pipelines: extraction + CRM + optional link.
 * The legacy worker keeps separate Inngest `step.run` boundaries; it may call the granular functions instead.
 */
export async function runIntakeBootstrapBoundary(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    raw_message: string;
    sender_email: string | undefined;
    origin_thread_id: string | undefined | null;
  },
): Promise<IntakeBootstrapBoundaryOutput> {
  const extraction = await runIntakeExtractionAndResearch(input.raw_message);
  const { weddingId, threadId } = await applyIntakeLeadCreation(supabase, {
    photographer_id: input.photographer_id,
    extraction,
    sender_email: input.sender_email,
    raw_message: input.raw_message,
  });
  const originThreadLinked = await applyIntakeOriginThreadLink(supabase, {
    photographer_id: input.photographer_id,
    origin_thread_id: input.origin_thread_id,
    new_wedding_id: weddingId,
  });
  return {
    extraction,
    weddingId,
    threadId,
    originThreadLinked,
  };
}

export { runIntakeExtractionAndResearch } from "./intakeExtraction.ts";
