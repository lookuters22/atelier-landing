/**
 * G5 grouped Gmail import — explicit project-attachment eligibility (Chunk 3).
 *
 * Label membership and "not suppressed" are NOT sufficient to CRM-link a thread
 * to the lazy batch wedding. Eligibility requires deterministic positive evidence:
 *   - inbound sender email matches an existing `clients.email` row for this
 *     photographer (any wedding), OR
 *   - inbound sender email matches an "anchor" set: senders already linked to
 *     this batch wedding via prior grouped-import threads in the same
 *     `gmail_label_import_group_id`.
 *
 * Ambiguous / unrelated human-looking mail stays unfiled (`wedding_id` null)
 * with provenance on the materialize/finalize path.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { extractSenderEmailFromRaw } from "../../../../src/lib/inboundSuppressionClassifier.ts";

export type GroupedAttachmentEligibilityEvaluation = {
  eligible: boolean;
  reason: string;
  evidence?: Record<string, unknown>;
};

/**
 * Pure decision — call after resolving `knownClientEmailMatch` and anchor set.
 */
export function evaluateGroupedImportAttachmentEligibility(args: {
  normalizedSenderEmail: string | null;
  anchorNormalizedEmails: ReadonlySet<string>;
  knownClientEmailMatch: boolean;
}): GroupedAttachmentEligibilityEvaluation {
  if (args.knownClientEmailMatch) {
    return {
      eligible: true,
      reason: "known_client_email",
      evidence: { path: "clients.email" },
    };
  }
  const em = args.normalizedSenderEmail?.trim().toLowerCase() ?? null;
  if (em && args.anchorNormalizedEmails.has(em)) {
    return {
      eligible: true,
      reason: "batch_sender_anchor_match",
      evidence: { normalized_sender_email: em },
    };
  }
  return {
    eligible: false,
    reason: "no_positive_attachment_evidence",
    evidence: {
      normalized_sender_email: em,
      anchor_size: args.anchorNormalizedEmails.size,
      known_client_email_match: args.knownClientEmailMatch,
    },
  };
}

export async function photographerHasClientMatchingEmail(
  supabaseAdmin: SupabaseClient,
  photographerId: string,
  normalizedEmail: string | null,
): Promise<boolean> {
  const em = normalizedEmail?.trim().toLowerCase() ?? "";
  if (!em) return false;

  const { count, error } = await supabaseAdmin
    .from("clients")
    .select("id, weddings!inner(photographer_id)", { count: "exact", head: true })
    .eq("weddings.photographer_id", photographerId)
    .ilike("email", em);

  if (error) {
    console.error("[gmailProjectAttachmentEligibility] clients lookup", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Rebuild anchor senders from threads already filed under the batch wedding for
 * this import group (covers Inngest step boundaries and retries).
 */
export async function loadAnchorEmailsForGroupedImportWedding(
  supabaseAdmin: SupabaseClient,
  photographerId: string,
  weddingId: string,
  groupId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const { data: threads, error } = await supabaseAdmin
    .from("threads")
    .select("id, ai_routing_metadata")
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .eq("channel", "email");

  if (error || !threads?.length) return out;

  for (const t of threads) {
    const meta = t.ai_routing_metadata as Record<string, unknown> | null;
    if (!meta || String(meta.gmail_label_import_group_id ?? "") !== groupId) {
      continue;
    }

    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("sender")
      .eq("thread_id", t.id as string)
      .eq("direction", "in")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const raw = typeof msg?.sender === "string" ? msg.sender : null;
    const em = extractSenderEmailFromRaw(raw);
    if (em) out.add(em.toLowerCase());
  }
  return out;
}
