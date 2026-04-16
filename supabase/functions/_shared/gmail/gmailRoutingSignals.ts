/**
 * Persisted header-derived signals for inbox routing (layer-1 heuristics before LLM).
 * Written at Gmail delta ingest; read by `preLlmEmailRouting`.
 */
import {
  classifyEmailLocalPart,
  type EmailLocalPartClass,
} from "../utils/emailLocalPartClass.ts";
import type { GmailFullThreadMessage } from "./gmailThreads.ts";

function headerFromPayload(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return typeof h?.value === "string" ? h.value : null;
}

export type GmailRoutingSignalsV1 = {
  version: 1;
  /** Present on marketing / bulk mail. */
  has_list_unsubscribe: boolean;
  /** True when Precedence is bulk or junk (RFC 3834 style). */
  precedence_bulk_or_junk: boolean;
  /** Auto-Submitted header present and indicates auto-generated mail */
  auto_submitted_present: boolean;
  /** Non-empty Feedback-ID (common list / ESP marker). */
  has_feedback_id: boolean;
  /** Parsed local-part class for From address, when inferrable */
  sender_localpart_class: EmailLocalPartClass;
};

function parsePrecedence(val: string | null): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === "bulk" || v === "junk" || v === "list";
}

function parseAutoSubmitted(val: string | null): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return (
    v.length > 0 &&
    (v === "auto-generated" ||
      v === "auto-replied" ||
      v.startsWith("auto-generated") ||
      v === "auto-notified")
  );
}

/**
 * Build compact routing signals from Gmail message headers (users.messages.get full payload).
 */
export function buildGmailRoutingSignalsFromMessage(msg: GmailFullThreadMessage): GmailRoutingSignalsV1 {
  const headers = msg.payload?.headers;
  const listUnsub = headerFromPayload(headers, "List-Unsubscribe");
  const precedence = headerFromPayload(headers, "Precedence");
  const autoSub = headerFromPayload(headers, "Auto-Submitted");
  const feedbackId = headerFromPayload(headers, "Feedback-ID");
  const from = headerFromPayload(headers, "From") ?? "";

  return {
    version: 1,
    has_list_unsubscribe: typeof listUnsub === "string" && listUnsub.trim().length > 0,
    precedence_bulk_or_junk: parsePrecedence(precedence),
    auto_submitted_present: parseAutoSubmitted(autoSub),
    has_feedback_id: typeof feedbackId === "string" && feedbackId.trim().length > 0,
    sender_localpart_class: classifyEmailLocalPart(from),
  };
}
