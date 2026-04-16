/**
 * Shared Gmail delta sync: history.list walk, outbound skip, inbound inserts on canonical threads.
 * Unknown Gmail threads get an immediate `threads` + `messages` row (visibility-first); `import_candidates`
 * is updated so prepare/materialize cannot duplicate canonical threads.
 * Checkpoint (`gmail_last_history_id`) is advanced only by callers after this function returns success for a full run.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { gmailExternalThreadKey } from "./gmailImportMaterialize.ts";
import {
  emailSubjectFromGmailMessage,
  extractInboundFieldsFromGmailMessage,
  gmailMessageHasSentLabel,
  sentAtIsoFromGmailMessage,
  threadTitleFromGmailMessage,
} from "./gmailDeltaInboundMessage.ts";
import {
  getGmailMessageFullAllowMissing,
  type GmailFullThreadMessage,
} from "./gmailThreads.ts";
import {
  GmailApiError,
  getGmailProfile,
  listGmailHistoryMessageAddedPage,
  listGmailMessagesListPage,
  type GmailHistoryAddedRef,
} from "./gmailWatchHistory.ts";

export const GMAIL_DELTA_MAX_HISTORY_PAGES = 50;
export const GMAIL_CATCHUP_Q = "newer_than:7d";
export const GMAIL_CATCHUP_MAX_PAGES = 5;
export const GMAIL_CATCHUP_PAGE_SIZE = 50;

export type DeltaProcessOneResult =
  | { action: "skipped_sent" }
  | { action: "skipped_existing_provider_id" }
  | { action: "skipped_message_not_found" }
  | { action: "inserted_inbound"; messageId: string; threadId: string }
  | { action: "inserted_inbound_new_thread"; messageId: string; threadId: string };

function summarizeDeltaActions(processed: DeltaProcessOneResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of processed) {
    out[p.action] = (out[p.action] ?? 0) + 1;
  }
  return out;
}

async function findThreadIdForGmailThread(
  supabase: SupabaseClient,
  photographerId: string,
  gmailThreadId: string,
): Promise<string | null> {
  const key = gmailExternalThreadKey(gmailThreadId);
  const { data } = await supabase
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", "email")
    .eq("external_thread_key", key)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

async function messageExistsByProviderId(
  supabase: SupabaseClient,
  photographerId: string,
  providerMessageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("provider_message_id", providerMessageId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

function isUniqueConstraintError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = err.message ?? "";
  return msg.includes("duplicate") || msg.includes("unique") || msg.includes("uq_threads");
}

function isImportCandidatesConflict(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = err.message ?? "";
  return msg.includes("duplicate") || msg.includes("unique");
}

/**
 * Insert canonical email thread for `gmail:<threadId>`. Safe under concurrent workers (unique key + re-select).
 */
async function ensureCanonicalThreadForDeltaUnknownGmail(
  supabase: SupabaseClient,
  photographerId: string,
  gmailThreadId: string,
  msg: GmailFullThreadMessage,
): Promise<{ threadId: string; createdNewThread: boolean }> {
  const externalKey = gmailExternalThreadKey(gmailThreadId);
  const title = threadTitleFromGmailMessage(msg);
  const lastActivityAt = sentAtIsoFromGmailMessage(msg);
  const now = new Date().toISOString();

  const { data: inserted, error: insErr } = await supabase
    .from("threads")
    .insert({
      photographer_id: photographerId,
      wedding_id: null,
      title: title.slice(0, 500),
      kind: "group",
      channel: "email",
      external_thread_key: externalKey,
      last_activity_at: lastActivityAt,
      last_inbound_at: null,
      status: "open",
      needs_human: false,
    })
    .select("id")
    .maybeSingle();

  if (!insErr && inserted?.id) {
    return { threadId: inserted.id as string, createdNewThread: true };
  }

  if (isUniqueConstraintError(insErr ?? null)) {
    const existing = await findThreadIdForGmailThread(supabase, photographerId, gmailThreadId);
    if (existing) return { threadId: existing, createdNewThread: false };
  }

  throw new Error(`threads insert: ${insErr?.message ?? "unknown error"}`);
}

/**
 * Link or create `import_candidates` so label prepare/materialize paths cannot create a second thread.
 */
async function neutralizeImportCandidatesForGmailDelta(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    gmailThreadId: string;
    canonicalThreadId: string;
    msg: GmailFullThreadMessage;
  },
): Promise<void> {
  const { photographerId, connectedAccountId, gmailThreadId, canonicalThreadId, msg } = params;
  const now = new Date().toISOString();
  const snippet = typeof msg.snippet === "string" ? msg.snippet : null;
  const subject = emailSubjectFromGmailMessage(msg);
  const prov = { delta_sync_canonical: true as const, materialized_at: now };

  const { data: existing, error: selErr } = await supabase
    .from("import_candidates")
    .select("id, status")
    .eq("photographer_id", photographerId)
    .eq("connected_account_id", connectedAccountId)
    .eq("raw_provider_thread_id", gmailThreadId)
    .maybeSingle();

  if (selErr) {
    throw new Error(`import_candidates select (neutralize): ${selErr.message}`);
  }

  const statusAfterNeutral = (prev: string | undefined): string => {
    if (prev === "pending" || prev === "approving") return "approved";
    return typeof prev === "string" && prev.length > 0 ? prev : "approved";
  };

  if (existing?.id) {
    const nextStatus = statusAfterNeutral(existing.status as string | undefined);
    const { error: updErr } = await supabase
      .from("import_candidates")
      .update({
        materialized_thread_id: canonicalThreadId,
        status: nextStatus,
        snippet,
        subject,
        updated_at: now,
        import_provenance: prov,
      })
      .eq("id", existing.id as string);
    if (updErr) {
      throw new Error(`import_candidates update (neutralize): ${updErr.message}`);
    }
    return;
  }

  const { error: insErr } = await supabase.from("import_candidates").insert({
    photographer_id: photographerId,
    connected_account_id: connectedAccountId,
    source_type: "gmail_history",
    source_identifier: gmailThreadId,
    source_label_name: "Gmail (history)",
    raw_provider_thread_id: gmailThreadId,
    message_count: 1,
    snippet,
    subject,
    status: "approved",
    materialized_thread_id: canonicalThreadId,
    import_provenance: prov,
    gmail_label_import_group_id: null,
    updated_at: now,
  });

  if (insErr && isImportCandidatesConflict(insErr)) {
    const { data: raced, error: sel2 } = await supabase
      .from("import_candidates")
      .select("id, status")
      .eq("photographer_id", photographerId)
      .eq("connected_account_id", connectedAccountId)
      .eq("raw_provider_thread_id", gmailThreadId)
      .maybeSingle();
    if (sel2 || !raced?.id) {
      throw new Error(`import_candidates re-select after insert race: ${sel2?.message ?? "missing row"}`);
    }
    const nextStatus = statusAfterNeutral(raced.status as string | undefined);
    const { error: retryErr } = await supabase
      .from("import_candidates")
      .update({
        materialized_thread_id: canonicalThreadId,
        status: nextStatus,
        snippet,
        subject,
        updated_at: now,
        import_provenance: prov,
      })
      .eq("id", raced.id as string);
    if (retryErr) {
      throw new Error(`import_candidates update after insert race: ${retryErr.message}`);
    }
    return;
  }

  if (insErr) {
    throw new Error(`import_candidates insert (neutralize): ${insErr.message}`);
  }
}

type InsertInboundResult =
  | { ok: true; messageId: string }
  | { ok: false; duplicate: true };

async function insertInboundMessageAndUpdateThread(
  supabase: SupabaseClient,
  params: {
    threadId: string;
    photographerId: string;
    msg: GmailFullThreadMessage;
    gmailThreadId: string;
    gmailMessageId: string;
    deltaTrace?: GmailDeltaTraceCtx;
  },
): Promise<InsertInboundResult> {
  const { threadId, photographerId, msg, gmailThreadId, gmailMessageId, deltaTrace } = params;
  const fields = extractInboundFieldsFromGmailMessage(msg, gmailThreadId);

  if (deltaTrace && !deltaTrace.firstWriteLogged) {
    console.log(
      "[gmail.delta_sync]",
      JSON.stringify({
        trace_id: deltaTrace.traceId,
        phase: "insert_upsert_start",
        t: new Date().toISOString(),
        table: "messages",
      }),
    );
  }

  const { data: ins, error: insErr } = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      photographer_id: photographerId,
      direction: "in",
      sender: fields.sender,
      body: fields.body,
      sent_at: fields.sentAtIso,
      provider_message_id: gmailMessageId,
      idempotency_key: gmailMessageId,
      metadata: fields.metadata,
      raw_payload: fields.raw_payload,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    const m = insErr.message ?? "";
    if (m.includes("duplicate") || m.includes("unique") || m.includes("uq_messages")) {
      return { ok: false, duplicate: true };
    }
    throw new Error(`messages insert: ${insErr.message}`);
  }
  if (!ins?.id) throw new Error("messages insert: missing id");

  if (deltaTrace && !deltaTrace.firstWriteLogged) {
    deltaTrace.firstWriteLogged = true;
    console.log(
      "[gmail.delta_sync]",
      JSON.stringify({
        trace_id: deltaTrace.traceId,
        phase: "insert_upsert_end",
        t: new Date().toISOString(),
        table: "messages",
      }),
    );
  }

  const tNow = fields.sentAtIso;
  await supabase
    .from("threads")
    .update({
      last_activity_at: tNow,
      last_inbound_at: tNow,
    })
    .eq("id", threadId)
    .eq("photographer_id", photographerId);

  return { ok: true, messageId: ins.id as string };
}

/**
 * Fetch full message, apply SENT / provider_message_id rules, then route to thread or staging.
 */
export type GmailDeltaTraceCtx = {
  traceId: string;
  /** First canonical insert or import_candidate upsert logs enqueue→insert latency split. */
  firstWriteLogged: boolean;
};

export async function processOneGmailMessageForDelta(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    accessToken: string;
    gmailThreadId: string;
    gmailMessageId: string;
    deltaTrace?: GmailDeltaTraceCtx;
  },
): Promise<DeltaProcessOneResult> {
  const { photographerId, connectedAccountId, accessToken, gmailThreadId, gmailMessageId, deltaTrace } =
    params;

  const full = await getGmailMessageFullAllowMissing(accessToken, gmailMessageId);
  if (!full) {
    console.log(
      "[gmail.delta_sync]",
      JSON.stringify({
        type: "message_skipped_messages_get_404",
        trace_id: deltaTrace?.traceId ?? null,
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        t: new Date().toISOString(),
      }),
    );
    return { action: "skipped_message_not_found" };
  }
  const msg: GmailFullThreadMessage = full;
  if (gmailMessageHasSentLabel(msg)) {
    return { action: "skipped_sent" };
  }

  if (await messageExistsByProviderId(supabase, photographerId, gmailMessageId)) {
    return { action: "skipped_existing_provider_id" };
  }

  let threadId = await findThreadIdForGmailThread(supabase, photographerId, gmailThreadId);
  const unknownThreadPath = !threadId;
  let createdNewThread = false;

  if (!threadId) {
    const ensured = await ensureCanonicalThreadForDeltaUnknownGmail(
      supabase,
      photographerId,
      gmailThreadId,
      msg,
    );
    threadId = ensured.threadId;
    createdNewThread = ensured.createdNewThread;
  }

  const inserted = await insertInboundMessageAndUpdateThread(supabase, {
    threadId,
    photographerId,
    msg,
    gmailThreadId,
    gmailMessageId,
    deltaTrace,
  });

  if (!inserted.ok) {
    return { action: "skipped_existing_provider_id" };
  }

  /** Link or create import_candidates so label prepare/materialize cannot materialize a second thread. */
  await neutralizeImportCandidatesForGmailDelta(supabase, {
    photographerId,
    connectedAccountId,
    gmailThreadId,
    canonicalThreadId: threadId,
    msg,
  });

  if (unknownThreadPath && createdNewThread) {
    return { action: "inserted_inbound_new_thread", messageId: inserted.messageId, threadId };
  }
  return { action: "inserted_inbound", messageId: inserted.messageId, threadId };
}

export type IncrementalDeltaResult =
  | {
      ok: true;
      targetHistoryId: string;
      startHistoryId: string;
      pages: number;
      messageRefs: number;
      processed: DeltaProcessOneResult[];
    }
  | { ok: false; error: string; history404?: boolean; profileHistoryId?: string };

/**
 * Walk history.list from `startHistoryId` (all pages, bounded), processing each messageAdded ref.
 * Does **not** persist checkpoint — caller updates `gmail_last_history_id` only after success.
 */
export async function runGmailIncrementalHistoryList(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    accessToken: string;
    startHistoryId: string;
    /** Correlates Pub/Sub → enqueue → worker → history.list → DB write. */
    traceId?: string;
  },
): Promise<IncrementalDeltaResult> {
  const { photographerId, connectedAccountId, accessToken, startHistoryId, traceId } = params;

  const deltaTrace: GmailDeltaTraceCtx | undefined = traceId
    ? { traceId, firstWriteLogged: false }
    : undefined;

  let pageToken: string | undefined;
  let pages = 0;
  let targetHistoryId = startHistoryId;
  const processed: DeltaProcessOneResult[] = [];
  let totalRefs = 0;

  const seenMessage = new Set<string>();
  let firstHistoryPage = true;

  for (;;) {
    if (pages >= GMAIL_DELTA_MAX_HISTORY_PAGES) {
      return { ok: false, error: "history_list_page_cap_exceeded" };
    }
    let page: Awaited<ReturnType<typeof listGmailHistoryMessageAddedPage>>;
    try {
      if (traceId && firstHistoryPage) {
        console.log(
          "[gmail.delta_sync]",
          JSON.stringify({
            trace_id: traceId,
            phase: "history_list_start",
            t: new Date().toISOString(),
            startHistoryId,
          }),
        );
      }
      page = await listGmailHistoryMessageAddedPage(accessToken, startHistoryId, {
        pageToken,
        maxResults: 100,
      });
      if (traceId && firstHistoryPage) {
        console.log(
          "[gmail.delta_sync]",
          JSON.stringify({
            trace_id: traceId,
            phase: "history_list_end",
            t: new Date().toISOString(),
            added: page.added.length,
          }),
        );
        firstHistoryPage = false;
      }
    } catch (e) {
      if (e instanceof GmailApiError && e.status === 404) {
        let profileHistoryId: string | undefined;
        try {
          const profile = await getGmailProfile(accessToken);
          profileHistoryId = profile.historyId;
        } catch {
          /* ignore */
        }
        return { ok: false, error: e.message, history404: true, profileHistoryId };
      }
      throw e;
    }

    pages += 1;
    targetHistoryId = page.historyId;

    const refs: GmailHistoryAddedRef[] = [];
    for (const r of page.added) {
      if (seenMessage.has(r.messageId)) continue;
      seenMessage.add(r.messageId);
      refs.push(r);
    }
    totalRefs += refs.length;

    for (const r of refs) {
      const one = await processOneGmailMessageForDelta(supabase, {
        photographerId,
        connectedAccountId,
        accessToken,
        gmailThreadId: r.threadId,
        gmailMessageId: r.messageId,
        deltaTrace,
      });
      processed.push(one);
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  console.log(
    "[gmail.delta_sync] incremental_summary",
    JSON.stringify({
      trace_id: traceId ?? null,
      startHistoryId,
      targetHistoryId,
      pages,
      messageRefs: totalRefs,
      actions: summarizeDeltaActions(processed),
    }),
  );

  return {
    ok: true,
    targetHistoryId,
    startHistoryId,
    pages,
    messageRefs: totalRefs,
    processed,
  };
}

export type CatchupResult =
  | { ok: true; processed: DeltaProcessOneResult[]; messageIds: number }
  | { ok: false; error: string };

/**
 * Bounded `messages.list` + per-message processing (404 recovery / gap fill).
 */
export async function runGmailCatchupRecentWindow(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    accessToken: string;
    traceId?: string;
  },
): Promise<CatchupResult> {
  const { photographerId, connectedAccountId, accessToken, traceId } = params;

  const deltaTrace: GmailDeltaTraceCtx | undefined = traceId
    ? { traceId, firstWriteLogged: false }
    : undefined;

  const processed: DeltaProcessOneResult[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let pages = 0;
  let idTotal = 0;

  for (;;) {
    if (pages >= GMAIL_CATCHUP_MAX_PAGES) break;
    const page = await listGmailMessagesListPage(accessToken, {
      q: GMAIL_CATCHUP_Q,
      maxResults: GMAIL_CATCHUP_PAGE_SIZE,
      pageToken,
    });
    pages += 1;
    idTotal += page.messageIds.length;

    for (const mid of page.messageIds) {
      if (seen.has(mid)) continue;
      seen.add(mid);

      const full = await getGmailMessageFullAllowMissing(accessToken, mid);
      if (!full) {
        console.log(
          "[gmail.delta_sync]",
          JSON.stringify({
            type: "catchup_skipped_messages_get_404",
            trace_id: deltaTrace?.traceId ?? null,
            gmail_message_id: mid,
            t: new Date().toISOString(),
          }),
        );
        processed.push({ action: "skipped_message_not_found" });
        continue;
      }
      const threadId = typeof full.threadId === "string" ? full.threadId : null;
      if (!threadId) continue;

      const one = await processOneGmailMessageForDelta(supabase, {
        photographerId,
        connectedAccountId,
        accessToken,
        gmailThreadId: threadId,
        gmailMessageId: mid,
        deltaTrace,
      });
      processed.push(one);
    }

    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  return { ok: true, processed, messageIds: idTotal };
}
