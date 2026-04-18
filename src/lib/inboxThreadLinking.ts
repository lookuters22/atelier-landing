/**
 * A6: Inbox thread domain writes — RPC-backed link and delete.
 * Callers own optimistic UI and `fireDataChanged()` after success when appropriate.
 */
import { supabase } from "./supabase";

export type LinkThreadToWeddingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function linkInboxThreadToWedding(params: {
  threadId: string;
  weddingId: string;
}): Promise<LinkThreadToWeddingResult> {
  const { data, error } = await supabase.rpc("link_thread_to_wedding", {
    p_thread_id: params.threadId,
    p_wedding_id: params.weddingId,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /link_thread_to_wedding/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430140000_rpc_link_thread_to_wedding.sql if the RPC is missing."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok === true) return { ok: true };
  return { ok: false, error: row.error ?? "unknown" };
}

export type ConvertUnfiledThreadToInquirySuppressionFailure = {
  ok: false;
  error: "suppressed_non_client_thread";
  verdict: string;
  reasons: string[];
  confidence: string;
};

export type ConvertUnfiledThreadToInquiryResult =
  | { ok: true; weddingId: string; alreadyLinked: boolean }
  | ConvertUnfiledThreadToInquirySuppressionFailure
  | { ok: false; error: string };

/**
 * Create inquiry wedding + lead client; link canonical thread.
 *
 * Defense-in-depth: the RPC (migration 20260507000000) runs
 * `classify_inbound_suppression()` against the latest inbound message and
 * returns a structured `suppressed_non_client_thread` failure for promo /
 * system / non-client senders (e.g. Booking.com campaign mail). Callers
 * should surface `verdict` + `reasons` to the operator rather than silently
 * showing a generic error.
 */
export async function convertUnfiledThreadToInquiry(params: {
  threadId: string;
  /** Optional: from `extractCoupleNamesForNewInquiry` — improves `weddings.couple_names` vs raw RPC fallback. */
  coupleNames?: string;
  leadClientName?: string;
}): Promise<ConvertUnfiledThreadToInquiryResult> {
  const { data, error } = await supabase.rpc("convert_unfiled_thread_to_inquiry", {
    p_thread_id: params.threadId,
    p_couple_names: params.coupleNames ?? null,
    p_lead_client_name: params.leadClientName ?? null,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /convert_unfiled_thread_to_inquiry/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430180000_rpc_convert_unfiled_thread_to_inquiry.sql if the RPC is missing."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  const row = data as {
    ok?: boolean;
    error?: string;
    wedding_id?: string;
    already_linked?: boolean;
    verdict?: string;
    reasons?: unknown;
    confidence?: string;
  } | null;

  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok !== true) {
    if (row.error === "suppressed_non_client_thread") {
      const reasons = Array.isArray(row.reasons)
        ? (row.reasons.filter((r) => typeof r === "string") as string[])
        : [];
      return {
        ok: false,
        error: "suppressed_non_client_thread",
        verdict: typeof row.verdict === "string" ? row.verdict : "unknown",
        reasons,
        confidence: typeof row.confidence === "string" ? row.confidence : "low",
      };
    }
    return { ok: false, error: row.error ?? "unknown" };
  }
  const wid = typeof row.wedding_id === "string" ? row.wedding_id : "";
  if (!wid) {
    return { ok: false, error: "missing_wedding_id" };
  }
  return {
    ok: true,
    weddingId: wid,
    alreadyLinked: row.already_linked === true,
  };
}

export type DeleteInboxThreadResult =
  | { ok: true }
  | { ok: false; error: string };

/** Delete a thread owned by the current user (`delete_inbox_thread` RPC). */
export async function deleteInboxThread(threadId: string): Promise<DeleteInboxThreadResult> {
  const { data, error } = await supabase.rpc("delete_inbox_thread", {
    p_thread_id: threadId,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /delete_inbox_thread/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430141000_rpc_delete_inbox_thread.sql if the RPC is missing."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok === true) return { ok: true };
  return { ok: false, error: row.error ?? "unknown" };
}
