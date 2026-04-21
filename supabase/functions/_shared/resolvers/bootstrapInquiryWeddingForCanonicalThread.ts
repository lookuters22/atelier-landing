/**
 * Create inquiry-stage project row (`weddings`) + client from an existing canonical inbound thread (Gmail delta path).
 * Does not insert threads/messages — attaches `threads.wedding_id` to the existing row.
 *
 * **`wedding_date` is intentionally `null`** when no verified calendar date exists (never substitutes “today”).
 * Requires DB migration `20260430192000_wedding_date_nullable_and_inquiry_rpcs.sql` (`ALTER COLUMN wedding_date DROP NOT NULL`).
 *
 * `project_type` defaults to `'wedding'` when omitted so existing callers keep current behavior.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Constants, type Database } from "../../../../src/types/database.types.ts";
import { extractEmailAddress } from "../utils/extractEmailAddress.ts";
import { normalizeEmail } from "../utils/normalizeEmail.ts";

type WeddingProjectType = Database["public"]["Enums"]["wedding_project_type"];

const ALLOWED_PROJECT_TYPES = new Set<string>(
  Constants.public.Enums.wedding_project_type as readonly string[],
);

function resolveProjectType(projectType: WeddingProjectType | undefined): WeddingProjectType {
  if (projectType === undefined) return "wedding";
  if (!ALLOWED_PROJECT_TYPES.has(projectType)) {
    throw new Error(`Invalid projectType: ${String(projectType)}`);
  }
  return projectType;
}

/** Postgres `not_null_violation` on `weddings.wedding_date` — DB missing nullable-date migration. */
function isWeddingDateNotNullConstraintError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message;
  if (!m.includes("wedding_date")) return false;
  if (err.code === "23502") return true;
  return m.includes("not-null") || m.includes("NOT NULL") || m.toLowerCase().includes("violates not-null");
}

export async function bootstrapInquiryWeddingForCanonicalThread(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    threadId: string;
    /** Latest inbound message body (for wedding title / story hint). */
    rawMessagePreview: string;
    /** From line on latest inbound. */
    senderEmail: string | null;
    /** Thread title when present. */
    threadTitle?: string | null;
    /** Row classification on `weddings.project_type`. Defaults to `'wedding'`. */
    projectType?: WeddingProjectType;
  },
): Promise<{ weddingId: string }> {
  const { photographerId, threadId, rawMessagePreview, senderEmail, threadTitle, projectType } =
    input;
  const resolvedProjectType = resolveProjectType(projectType);

  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .select("id, wedding_id, photographer_id, title")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (tErr || !thread) {
    throw new Error(`Thread not found: ${tErr?.message ?? ""}`);
  }
  if (thread.wedding_id) {
    return { weddingId: thread.wedding_id as string };
  }

  const coupleNames =
    (typeof threadTitle === "string" && threadTitle.trim().length > 0
      ? threadTitle.trim()
      : rawMessagePreview.slice(0, 80).trim()) || "New inquiry";

  const { data: wedding, error: wErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: coupleNames.slice(0, 500),
      wedding_date: null,
      location: "TBD",
      stage: "inquiry",
      project_type: resolvedProjectType,
      story_notes: rawMessagePreview.slice(0, 8000) || null,
    })
    .select("id")
    .single();

  if (wErr || !wedding) {
    if (wErr && isWeddingDateNotNullConstraintError(wErr)) {
      throw new Error(
        `Failed to create wedding: ${wErr.message} — weddings.wedding_date must be nullable for inquiry bootstrap ` +
          `(apply migration 20260430192000_wedding_date_nullable_and_inquiry_rpcs.sql). ` +
          `Do not use invented dates as a substitute.`,
      );
    }
    throw new Error(`Failed to create wedding: ${wErr?.message ?? ""}`);
  }

  const weddingId = wedding.id as string;

  const email = normalizeEmail(extractEmailAddress(senderEmail) ?? senderEmail ?? "") || null;
  const { error: cErr } = await supabase.from("clients").insert({
    wedding_id: weddingId,
    name: coupleNames.slice(0, 500),
    role: "Lead",
    email,
  });

  if (cErr) {
    throw new Error(`Failed to create client: ${cErr.message}`);
  }

  const { error: uErr } = await supabase
    .from("threads")
    .update({
      wedding_id: weddingId,
      ai_routing_metadata: null,
    })
    .eq("id", threadId)
    .eq("photographer_id", photographerId);

  if (uErr) {
    throw new Error(`Failed to link thread to wedding: ${uErr.message}`);
  }

  return { weddingId };
}

/** Alias for `bootstrapInquiryWeddingForCanonicalThread` — same behavior and signature. */
export const bootstrapInquiryProjectForCanonicalThread = bootstrapInquiryWeddingForCanonicalThread;
