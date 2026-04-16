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

export type ConvertUnfiledThreadToInquiryResult =
  | { ok: true; weddingId: string; alreadyLinked: boolean }
  | { ok: false; error: string };

/**
 * Create inquiry wedding + lead client; link canonical thread
 * (`20260430180000_rpc_convert_unfiled_thread_to_inquiry.sql`, names extension `20260430190000_…`).
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
  } | null;

  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok !== true) {
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
