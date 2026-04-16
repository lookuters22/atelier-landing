import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type GmailInboxSendReplyInput = {
  connectedAccountId: string;
  threadId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  inReplyToProviderMessageId: string;
};

export type GmailInboxSendComposeInput = {
  connectedAccountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type GmailInboxSendResult =
  | { ok: true; mode: "reply"; messageId: string; providerMessageId: string }
  | { ok: true; mode: "compose"; threadId: string; messageId: string; providerMessageId: string }
  | { ok: false; error: string };

const MAX_ERR = 220;

function truncate(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_ERR) return t;
  return `${t.slice(0, MAX_ERR - 1)}…`;
}

function isFunctionsClass(e: unknown, name: string): boolean {
  if (e instanceof FunctionsFetchError || e instanceof FunctionsHttpError || e instanceof FunctionsRelayError) {
    return e.name === name;
  }
  return typeof e === "object" && e !== null && (e as { name?: string }).name === name;
}

/**
 * Maps backend / Gmail error strings to operator-facing copy (also used for JSON `error` on 4xx/5xx).
 */
export function humanizeGmailSendBackendError(raw: string): string {
  const t = raw.trim();
  if (!t) return "Send failed. Try again.";

  if (/^Missing or invalid Authorization header$/i.test(t) || /^Unauthorized$/i.test(t)) {
    return "Your session expired. Refresh the page and sign in again.";
  }

  if (
    /OAuth tokens not found/i.test(t) ||
    /Gmail authorization failed/i.test(t) ||
    /Connected Google account not found/i.test(t) ||
    /invalid_grant|token.*revoked|reauth/i.test(t)
  ) {
    return "Reconnect Google in Settings to send mail.";
  }

  if (/non-2xx|Edge Function returned a non-2xx status code/i.test(t)) {
    return "Send could not complete. Check your connection and try again.";
  }

  return truncate(t);
}

/**
 * Turns Supabase Functions invoke errors into actionable copy. See `FunctionsFetchError` / `FunctionsHttpError` in `@supabase/functions-js`.
 */
export async function humanizeGmailSendInvokeError(error: unknown): Promise<string> {
  if (isFunctionsClass(error, "FunctionsFetchError")) {
    return "Send is unavailable right now. The request to the Gmail send service did not complete. Check your network or VPN. If this environment uses a different Supabase project than the one where gmail-send was deployed, fix VITE_SUPABASE_URL or deploy: supabase functions deploy gmail-send.";
  }

  if (isFunctionsClass(error, "FunctionsRelayError")) {
    return "Send could not reach the Gmail send service (Supabase relay). Try again in a moment.";
  }

  if (error instanceof FunctionsHttpError || isFunctionsClass(error, "FunctionsHttpError")) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const status = ctx.status;
      if (status === 401 || status === 403) {
        return "Your session expired or this action is not allowed. Refresh the page and sign in again.";
      }
      if (status === 404) {
        return "Send is unavailable in this environment. The gmail-send Edge Function may not be deployed, or the app is pointed at the wrong Supabase project. Deploy gmail-send and confirm VITE_SUPABASE_URL matches that project.";
      }
      if (status === 502 || status === 503 || status === 504) {
        return "The Gmail send service is temporarily unavailable. Try again shortly.";
      }

      try {
        const body = (await ctx.clone().json()) as Record<string, unknown>;
        if (typeof body.error === "string" && body.error.trim()) {
          return humanizeGmailSendBackendError(body.error);
        }
      } catch {
        try {
          const text = (await ctx.clone().text()).trim();
          if (text) return truncate(text);
        } catch {
          /* ignore */
        }
      }
    }
    return "The Gmail send service returned an error. Try again.";
  }

  const msg = error instanceof Error ? error.message : String(error);
  return humanizeGmailSendBackendError(msg);
}

export async function invokeGmailInboxSendReply(input: GmailInboxSendReplyInput): Promise<GmailInboxSendResult> {
  const { data, error } = await supabase.functions.invoke("gmail-send", {
    body: {
      mode: "reply",
      connected_account_id: input.connectedAccountId,
      thread_id: input.threadId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      in_reply_to_provider_message_id: input.inReplyToProviderMessageId,
    },
  });

  if (error) {
    return { ok: false, error: await humanizeGmailSendInvokeError(error) };
  }

  const payload = data as Record<string, unknown> | null;
  if (payload && typeof payload.error === "string") {
    return { ok: false, error: humanizeGmailSendBackendError(payload.error) };
  }
  if (payload?.ok === true && typeof payload.message_id === "string" && typeof payload.provider_message_id === "string") {
    return {
      ok: true,
      mode: "reply",
      messageId: payload.message_id,
      providerMessageId: payload.provider_message_id,
    };
  }
  return { ok: false, error: "Unexpected response from send" };
}

export async function invokeGmailInboxSendCompose(input: GmailInboxSendComposeInput): Promise<GmailInboxSendResult> {
  const { data, error } = await supabase.functions.invoke("gmail-send", {
    body: {
      mode: "compose",
      connected_account_id: input.connectedAccountId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
    },
  });

  if (error) {
    return { ok: false, error: await humanizeGmailSendInvokeError(error) };
  }

  const payload = data as Record<string, unknown> | null;
  if (payload && typeof payload.error === "string") {
    return { ok: false, error: humanizeGmailSendBackendError(payload.error) };
  }
  if (
    payload?.ok === true &&
    typeof payload.thread_id === "string" &&
    typeof payload.message_id === "string" &&
    typeof payload.provider_message_id === "string"
  ) {
    return {
      ok: true,
      mode: "compose",
      threadId: payload.thread_id,
      messageId: payload.message_id,
      providerMessageId: payload.provider_message_id,
    };
  }
  return { ok: false, error: "Unexpected response from send" };
}
