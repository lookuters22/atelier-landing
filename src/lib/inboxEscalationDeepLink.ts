import { supabase } from "./supabase";
import type { UnfiledThread } from "../hooks/useUnfiledInbox";
import { fetchGmailImportHtmlForDisplay } from "./gmailImportMessageMetadata";
import {
  INBOX_SINGLE_THREAD_SELECT_FULL,
  INBOX_SINGLE_THREAD_SELECT_LEGACY,
  isMissingLatestProviderMessageIdPostgresError,
} from "./inboxLatestViewSelect";
import { mapInboxLatestProjectionRow } from "./inboxThreadProjection";

/**
 * Load a thread by id for `/inbox?threadId=&escalationId=` when the thread is not in the unfiled list.
 * Uses `v_threads_inbox_latest_message` (G4) — same projection as the unfiled list.
 */
export async function fetchThreadRowForEscalationDeepLink(threadId: string): Promise<UnfiledThread | null> {
  let res = await supabase
    .from("v_threads_inbox_latest_message")
    .select(INBOX_SINGLE_THREAD_SELECT_FULL)
    .eq("id", threadId)
    .maybeSingle();

  if (res.error && isMissingLatestProviderMessageIdPostgresError(res.error)) {
    res = await supabase
      .from("v_threads_inbox_latest_message")
      .select(INBOX_SINGLE_THREAD_SELECT_LEGACY)
      .eq("id", threadId)
      .maybeSingle();
  }

  const { data, error } = res;
  if (error || !data) return null;

  const mapped = mapInboxLatestProjectionRow(data as Record<string, unknown>);
  if (mapped.latestMessageHtmlSanitized || !mapped.gmailRenderHtmlRef) return mapped;
  const html = await fetchGmailImportHtmlForDisplay(supabase, mapped.gmailRenderHtmlRef);
  return html ? { ...mapped, latestMessageHtmlSanitized: html } : mapped;
}
