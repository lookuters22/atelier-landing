/**
 * Inbox list projection (`v_threads_inbox_latest_message`). The view gained
 * `latest_provider_message_id` in migration `20260415120100_v_threads_inbox_latest_provider_message_id.sql`.
 * Hosted DBs that have not applied it return Postgres 42703 when the column is selected; callers may retry
 * with {@link INBOX_LATEST_MESSAGE_SELECT_LEGACY} once (see {@link isMissingLatestProviderMessageIdPostgresError}).
 */

export const INBOX_LATEST_MESSAGE_SELECT_FULL =
  "id, wedding_id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json, latest_provider_message_id";

export const INBOX_LATEST_MESSAGE_SELECT_LEGACY =
  "id, wedding_id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json";

/** Single-thread fetch (e.g. escalation deep link) — same column split as list. */
export const INBOX_SINGLE_THREAD_SELECT_FULL =
  "id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json, latest_provider_message_id";

export const INBOX_SINGLE_THREAD_SELECT_LEGACY =
  "id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json";

/** True only when the failure is specifically the missing `latest_provider_message_id` column (schema drift). */
export function isMissingLatestProviderMessageIdPostgresError(err: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!err?.message) return false;
  const msg = err.message;
  if (!msg.includes("latest_provider_message_id")) return false;
  const code = String(err.code ?? "");
  if (code === "42703") return true;
  return /does not exist|undefined column/i.test(msg);
}
