/**
 * Operator Gmail send (Inbox reply / compose) — shared by `gmail-send` Edge and `outbound` worker.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ensureValidGoogleAccessToken } from "./ensureGoogleAccess.ts";
import { extractFirstMailboxFromRecipientField, mailboxesAreSameMailbox } from "./mailboxNormalize.ts";
import {
  buildPlainTextRfc822,
  getGmailMessageHeaderMessageId,
  getGmailMessageRfc822ReplyHeaders,
  mergeReferencesForReply,
  resolveGmailReplySubjectLine,
  sendGmailUsersMessagesSend,
} from "./gmailSendRfc822.ts";
import { buildGmailReplyThreadMismatchError } from "./gmailReplyThreadDiagnostics.ts";

export function parseGmailThreadIdFromExternalKey(externalThreadKey: string | null | undefined): string | null {
  if (!externalThreadKey || typeof externalThreadKey !== "string") return null;
  if (!externalThreadKey.startsWith("gmail:")) return null;
  const id = externalThreadKey.slice("gmail:".length).trim();
  return id.length > 0 ? id : null;
}

async function loadGoogleTokens(
  supabaseAdmin: SupabaseClient,
  connectedAccountId: string,
  photographerId: string,
): Promise<
  | { ok: true; accessToken: string; fromEmail: string }
  | { ok: false; error: string }
> {
  const { data: account, error: aErr } = await supabaseAdmin
    .from("connected_accounts")
    .select("id, photographer_id, email, token_expires_at")
    .eq("id", connectedAccountId)
    .eq("photographer_id", photographerId)
    .eq("provider", "google")
    .maybeSingle();

  if (aErr || !account) {
    return { ok: false, error: "Connected Google account not found" };
  }

  const { data: tok, error: tErr } = await supabaseAdmin
    .from("connected_account_oauth_tokens")
    .select("access_token, refresh_token")
    .eq("connected_account_id", connectedAccountId)
    .maybeSingle();

  if (tErr || !tok?.access_token) {
    return { ok: false, error: "OAuth tokens not found for this account" };
  }

  try {
    const ensured = await ensureValidGoogleAccessToken(
      {
        id: account.id as string,
        photographer_id: account.photographer_id as string,
        token_expires_at: account.token_expires_at as string | null,
      },
      { access_token: tok.access_token as string, refresh_token: tok.refresh_token as string | null },
    );
    const fromEmail = String(account.email ?? "").trim();
    if (!fromEmail) {
      return { ok: false, error: "Connected account has no email address" };
    }
    return { ok: true, accessToken: ensured.accessToken, fromEmail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Gmail authorization failed: ${msg}`.slice(0, 500) };
  }
}

/**
 * Gmail reply on an existing Atelier email thread.
 *
 * **Reply `Subject` precedence** (threading-safe; see `resolveGmailReplySubjectLine`):
 * 1. `Subject` from the anchor Gmail message metadata (same fetch as RFC `Message-ID` / `References`)
 * 2. `params.subject` when non-empty (e.g. UI-composed line)
 * 3. `threads.title` fallback
 * 4. `Re: (no subject)` if all absent
 *
 * Anchor wins over `params.subject` so `threads.title` drift cannot fork Gmail threading.
 */
export async function sendGmailReplyAndInsertMessage(
  supabaseAdmin: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    threadId: string;
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
    inReplyToProviderMessageId: string;
  },
): Promise<{ ok: true; messageId: string; gmailMessageId: string } | { ok: false; error: string }> {
  const to = params.to.trim();
  const body = params.body.trim();
  if (!to || !body) {
    return { ok: false, error: "To and body are required" };
  }

  const { data: thread, error: tErr } = await supabaseAdmin
    .from("threads")
    .select("id, photographer_id, channel, external_thread_key, title")
    .eq("id", params.threadId)
    .maybeSingle();

  if (tErr || !thread) {
    return { ok: false, error: "Thread not found" };
  }
  if (thread.photographer_id !== params.photographerId) {
    return { ok: false, error: "Thread tenant mismatch" };
  }
  if (thread.channel !== "email") {
    return { ok: false, error: "Thread is not an email thread" };
  }

  const gmailThreadId = parseGmailThreadIdFromExternalKey(thread.external_thread_key as string | null);
  if (!gmailThreadId) {
    return { ok: false, error: "Thread is not Gmail-backed (missing gmail: external_thread_key)" };
  }

  const tok = await loadGoogleTokens(supabaseAdmin, params.connectedAccountId, params.photographerId);
  if (!tok.ok) return tok;

  const toMailbox = extractFirstMailboxFromRecipientField(to);
  if (!toMailbox) {
    return { ok: false, error: "To must contain a valid email address" };
  }
  if (mailboxesAreSameMailbox(toMailbox, tok.fromEmail)) {
    return {
      ok: false,
      error:
        "Reply cannot be sent to your own mailbox. Fix the To field to the external recipient’s address.",
    };
  }

  /** Prefer latest inbound with Gmail id; else latest message with Gmail id (stale UI cannot fork threads). */
  const { data: anchorIn } = await supabaseAdmin
    .from("messages")
    .select("provider_message_id")
    .eq("thread_id", params.threadId)
    .eq("photographer_id", params.photographerId)
    .eq("direction", "in")
    .not("provider_message_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: anchorAny } = await supabaseAdmin
    .from("messages")
    .select("provider_message_id")
    .eq("thread_id", params.threadId)
    .eq("photographer_id", params.photographerId)
    .not("provider_message_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const anchorInPid =
    typeof anchorIn?.provider_message_id === "string" ? anchorIn.provider_message_id.trim() : "";
  const anchorAnyPid =
    typeof anchorAny?.provider_message_id === "string" ? anchorAny.provider_message_id.trim() : "";
  const clientPid = params.inReplyToProviderMessageId.trim();
  const effectiveInReplyTo = anchorInPid || anchorAnyPid || clientPid;
  if (!effectiveInReplyTo) {
    return {
      ok: false,
      error:
        "No Gmail message id to reply to (missing provider_message_id on thread messages — sync or backfill required).",
    };
  }

  let inReplyRfc: string | null = null;
  let referencesMerged: string | null = null;
  /** Snapshot from anchor metadata fetch (null if the fetch threw before returning). */
  let replyHdrSnapshot: Awaited<ReturnType<typeof getGmailMessageRfc822ReplyHeaders>> | null = null;
  try {
    const hdr = await getGmailMessageRfc822ReplyHeaders(tok.accessToken, effectiveInReplyTo);
    replyHdrSnapshot = hdr;
    inReplyRfc = hdr.messageIdRfc;
    referencesMerged = mergeReferencesForReply(hdr.references, hdr.messageIdRfc);
    if (!inReplyRfc) {
      inReplyRfc = await getGmailMessageHeaderMessageId(tok.accessToken, effectiveInReplyTo);
    }
    if (!referencesMerged && inReplyRfc) {
      referencesMerged = inReplyRfc;
    }
  } catch {
    replyHdrSnapshot = null;
    try {
      inReplyRfc = await getGmailMessageHeaderMessageId(tok.accessToken, effectiveInReplyTo);
    } catch {
      inReplyRfc = null;
    }
    referencesMerged = inReplyRfc;
  }

  const { subject: subj } = resolveGmailReplySubjectLine({
    anchorSubjectFromGmail: replyHdrSnapshot?.subject ?? null,
    callerSubject: params.subject,
    threadTitle: thread.title as string | null,
  });

  const raw = buildPlainTextRfc822({
    from: tok.fromEmail,
    to,
    cc: params.cc,
    bcc: params.bcc,
    subject: subj,
    body: params.body,
    inReplyToMessageIdHeader: inReplyRfc,
    referencesHeader: referencesMerged ?? inReplyRfc,
  });

  let sent: { id: string; threadId: string; labelIds?: string[] };
  try {
    sent = await sendGmailUsersMessagesSend(tok.accessToken, {
      rawRfc822: raw,
      gmailThreadId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  if (sent.threadId !== gmailThreadId) {
    const anchorSubjectFound = Boolean(
      replyHdrSnapshot?.subject && String(replyHdrSnapshot.subject).trim().length > 0,
    );
    const anchorRfcMessageIdFound = Boolean(inReplyRfc && inReplyRfc.trim().length > 0);
    return {
      ok: false,
      error: buildGmailReplyThreadMismatchError({
        expectedGmailThreadId: gmailThreadId,
        actualGmailThreadId: sent.threadId,
        anchorProviderMessageId: effectiveInReplyTo,
        anchorRfcMessageIdFound,
        anchorSubjectFound,
        finalSubject: subj,
      }),
    };
  }

  const now = new Date().toISOString();
  const labelIds = Array.isArray(sent.labelIds) ? sent.labelIds : [];
  const metadata = {
    gmail_import: {
      gmail_message_id: sent.id,
      gmail_thread_id: gmailThreadId,
      outbound: true,
      gmail_label_ids: labelIds,
    },
  };

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("messages")
    .insert({
      thread_id: params.threadId,
      photographer_id: params.photographerId,
      direction: "out",
      sender: tok.fromEmail,
      body: params.body,
      sent_at: now,
      provider_message_id: sent.id,
      idempotency_key: sent.id,
      metadata,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !ins?.id) {
    return { ok: false, error: insErr?.message ?? "Failed to record sent message" };
  }

  await supabaseAdmin
    .from("threads")
    .update({
      last_activity_at: now,
      last_outbound_at: now,
    })
    .eq("id", params.threadId)
    .eq("photographer_id", params.photographerId);

  return { ok: true, messageId: ins.id as string, gmailMessageId: sent.id };
}

export async function sendGmailComposeNewThreadAndInsert(
  supabaseAdmin: SupabaseClient,
  params: {
    photographerId: string;
    connectedAccountId: string;
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
  },
): Promise<
  { ok: true; threadId: string; messageId: string; gmailMessageId: string } | { ok: false; error: string }
> {
  const to = params.to.trim();
  const body = params.body.trim();
  const subject = params.subject.trim() || "(no subject)";
  if (!to || !body) {
    return { ok: false, error: "To and body are required" };
  }

  const tok = await loadGoogleTokens(supabaseAdmin, params.connectedAccountId, params.photographerId);
  if (!tok.ok) return tok;

  const raw = buildPlainTextRfc822({
    from: tok.fromEmail,
    to,
    cc: params.cc,
    bcc: params.bcc,
    subject,
    body: params.body,
    inReplyToMessageIdHeader: null,
    referencesHeader: null,
  });

  let sent: { id: string; threadId: string; labelIds?: string[] };
  try {
    sent = await sendGmailUsersMessagesSend(tok.accessToken, {
      rawRfc822: raw,
      gmailThreadId: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const gmailThreadId = sent.threadId;
  const externalKey = `gmail:${gmailThreadId}`;
  const now = new Date().toISOString();
  const labelIds = Array.isArray(sent.labelIds) ? sent.labelIds : [];

  const { data: th, error: thErr } = await supabaseAdmin
    .from("threads")
    .insert({
      photographer_id: params.photographerId,
      wedding_id: null,
      title: subject.slice(0, 500),
      kind: "group",
      channel: "email",
      external_thread_key: externalKey,
      last_activity_at: now,
      last_outbound_at: now,
      status: "open",
      needs_human: false,
    })
    .select("id")
    .maybeSingle();

  if (thErr || !th?.id) {
    return { ok: false, error: thErr?.message ?? "Failed to create thread" };
  }

  const threadId = th.id as string;

  const metadata = {
    gmail_import: {
      gmail_message_id: sent.id,
      gmail_thread_id: gmailThreadId,
      outbound: true,
      compose: true,
      gmail_label_ids: labelIds,
    },
  };

  const { data: ins, error: insErr } = await supabaseAdmin
    .from("messages")
    .insert({
      thread_id: threadId,
      photographer_id: params.photographerId,
      direction: "out",
      sender: tok.fromEmail,
      body: params.body,
      sent_at: now,
      provider_message_id: sent.id,
      metadata,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !ins?.id) {
    return { ok: false, error: insErr?.message ?? "Failed to record sent message" };
  }

  return {
    ok: true,
    threadId,
    messageId: ins.id as string,
    gmailMessageId: sent.id,
  };
}

/** Used by approval `outbound` worker: send body as reply on Gmail-backed email thread (no extra headers from UI). */
export async function sendGmailReplyForApprovedDraft(
  supabaseAdmin: SupabaseClient,
  params: {
    photographerId: string;
    /** Defaults to first Google connected account for photographer. */
    connectedAccountId?: string | null;
    threadId: string;
    body: string;
  },
): Promise<{ ok: true; gmailMessageId: string } | { ok: false; error: string; skip?: boolean }> {
  const body = params.body.trim();
  if (!body) return { ok: false, error: "Empty draft body", skip: true };

  const { data: thread, error: tErr } = await supabaseAdmin
    .from("threads")
    .select("id, photographer_id, channel, external_thread_key, title")
    .eq("id", params.threadId)
    .maybeSingle();

  if (tErr || !thread) return { ok: false, error: "Thread not found", skip: true };
  if (thread.photographer_id !== params.photographerId) {
    return { ok: false, error: "Thread tenant mismatch", skip: true };
  }
  if (thread.channel !== "email") {
    return { ok: false, error: "not_email", skip: true };
  }

  const gmailThreadId = parseGmailThreadIdFromExternalKey(thread.external_thread_key as string | null);
  if (!gmailThreadId) {
    return { ok: false, error: "not_gmail_thread", skip: true };
  }

  let connectedAccountId = params.connectedAccountId?.trim() ?? "";
  if (!connectedAccountId) {
    const { data: acct } = await supabaseAdmin
      .from("connected_accounts")
      .select("id")
      .eq("photographer_id", params.photographerId)
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    connectedAccountId = (acct?.id as string) ?? "";
  }
  if (!connectedAccountId) {
    return { ok: false, error: "No Google account connected", skip: true };
  }

  const { data: lastIn, error: liErr } = await supabaseAdmin
    .from("messages")
    .select("sender, provider_message_id")
    .eq("thread_id", params.threadId)
    .eq("direction", "in")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (liErr || !lastIn?.sender) {
    return { ok: false, error: "No inbound message to reply to", skip: false };
  }
  const inReplyTo = typeof lastIn.provider_message_id === "string" ? lastIn.provider_message_id : "";
  if (!inReplyTo) {
    return {
      ok: false,
      error: "Latest inbound message has no Gmail message id — cannot send Gmail reply (run provider id backfill or re-import)",
      skip: false,
    };
  }

  const to = String(lastIn.sender).trim();

  const out = await sendGmailReplyAndInsertMessage(supabaseAdmin, {
    photographerId: params.photographerId,
    connectedAccountId,
    threadId: params.threadId,
    to,
    cc: "",
    bcc: "",
    /** Empty: subject comes from anchor Gmail `Subject` via `sendGmailReplyAndInsertMessage`, then thread.title. */
    subject: "",
    body: params.body,
    inReplyToProviderMessageId: inReplyTo,
  });

  if (!out.ok) return { ok: false, error: out.error };
  return { ok: true, gmailMessageId: out.gmailMessageId };
}
