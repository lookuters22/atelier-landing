import { supabase } from "./supabase";

export type GmailInboxModifyAction = "star" | "unstar" | "mark_read" | "mark_unread";

export type GmailInboxModifyResult =
  | { ok: true; label_ids: string[] }
  | { ok: false; error: string };

/**
 * Star / read state for Gmail-imported messages (canonical `provider_message_id`).
 * Non-Gmail threads must not call this.
 */
export async function invokeGmailInboxModify(args: {
  connectedAccountId: string;
  providerMessageId: string;
  action: GmailInboxModifyAction;
}): Promise<GmailInboxModifyResult> {
  const { data, error } = await supabase.functions.invoke("gmail-modify-message", {
    body: {
      connected_account_id: args.connectedAccountId,
      provider_message_id: args.providerMessageId,
      action: args.action,
    },
  });

  const payload = data as Record<string, unknown> | null;

  if (payload && payload.ok === false) {
    if (payload.error_code === "insufficient_gmail_scopes" && typeof payload.error === "string") {
      return { ok: false, error: payload.error };
    }
    if (typeof payload.error === "string") {
      return {
        ok: false,
        error: humanizeGmailModifyError(payload.error),
      };
    }
  }

  if (error) {
    return { ok: false, error: humanizeGmailModifyError(error.message) };
  }

  if (payload?.ok === true && Array.isArray(payload.label_ids)) {
    return { ok: true, label_ids: payload.label_ids as string[] };
  }

  if (payload && typeof payload.error === "string") {
    const detail = typeof payload.detail === "string" ? payload.detail : null;
    return {
      ok: false,
      error: humanizeGmailModifyError(detail ? `${payload.error}: ${detail}` : payload.error),
    };
  }

  return { ok: false, error: "Unexpected response from Gmail sync" };
}

function humanizeGmailModifyError(raw: string): string {
  const t = raw.trim();
  if (
    /insufficient authentication scopes?/i.test(t) ||
    /messages\.modify failed:\s*403/i.test(t) ||
    /gmail messages\.modify failed:\s*403/i.test(t)
  ) {
    return "Google needs updated Gmail permissions for star and read/unread. Open Settings → Integrations and tap Reconnect Gmail.";
  }
  if (/non-2xx|Edge Function returned/i.test(t)) {
    return "Could not reach Gmail. Check your connection and try again.";
  }
  if (t.length > 200) return `${t.slice(0, 197)}…`;
  return t;
}
