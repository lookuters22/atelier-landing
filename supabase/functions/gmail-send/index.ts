/**
 * Operator Gmail send from Inbox: reply on Gmail-backed thread or new compose (creates thread).
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";
import { sendGmailComposeNewThreadAndInsert, sendGmailReplyAndInsertMessage } from "../_shared/gmail/gmailOperatorSend.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const photographerId = await requirePhotographerIdFromJwt(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const connectedAccountId =
      typeof body.connected_account_id === "string" ? body.connected_account_id.trim() : "";
    const mode = body.mode === "compose" ? "compose" : "reply";

    if (!connectedAccountId || !UUID_RE.test(connectedAccountId)) {
      return json({ error: "connected_account_id must be a valid UUID" }, 400);
    }

    if (mode === "reply") {
      const threadId = typeof body.thread_id === "string" ? body.thread_id.trim() : "";
      const to = typeof body.to === "string" ? body.to : "";
      const cc = typeof body.cc === "string" ? body.cc : "";
      const bcc = typeof body.bcc === "string" ? body.bcc : "";
      const subject = typeof body.subject === "string" ? body.subject : "";
      const text = typeof body.body === "string" ? body.body : "";
      const inReplyTo =
        typeof body.in_reply_to_provider_message_id === "string" ? body.in_reply_to_provider_message_id.trim() : "";

      if (!threadId || !UUID_RE.test(threadId)) {
        return json({ error: "thread_id is required" }, 400);
      }
      if (!inReplyTo) {
        return json({ error: "in_reply_to_provider_message_id is required for reply" }, 400);
      }

      const out = await sendGmailReplyAndInsertMessage(supabaseAdmin, {
        photographerId,
        connectedAccountId,
        threadId,
        to,
        cc,
        bcc,
        subject,
        body: text,
        inReplyToProviderMessageId: inReplyTo,
      });

      if (!out.ok) {
        logA4EdgeOpLatencyV1({
          edge: "gmail-send",
          action: "reply",
          ok: false,
          duration_ms: Date.now() - startedAt,
          photographer_id: photographerId,
          http_status: 400,
        });
        return json({ error: out.error }, 400);
      }

      logA4EdgeOpLatencyV1({
        edge: "gmail-send",
        action: "reply",
        ok: true,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 200,
      });
      return json({
        ok: true,
        mode: "reply",
        message_id: out.messageId,
        provider_message_id: out.gmailMessageId,
      });
    }

    const to = typeof body.to === "string" ? body.to : "";
    const cc = typeof body.cc === "string" ? body.cc : "";
    const bcc = typeof body.bcc === "string" ? body.bcc : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const text = typeof body.body === "string" ? body.body : "";

    const out = await sendGmailComposeNewThreadAndInsert(supabaseAdmin, {
      photographerId,
      connectedAccountId,
      to,
      cc,
      bcc,
      subject,
      body: text,
    });

    if (!out.ok) {
      logA4EdgeOpLatencyV1({
        edge: "gmail-send",
        action: "compose",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: out.error }, 400);
    }

    logA4EdgeOpLatencyV1({
      edge: "gmail-send",
      action: "compose",
      ok: true,
      duration_ms: Date.now() - startedAt,
      photographer_id: photographerId,
      http_status: 200,
    });
    return json({
      ok: true,
      mode: "compose",
      thread_id: out.threadId,
      message_id: out.messageId,
      provider_message_id: out.gmailMessageId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      return json({ error: msg }, 401);
    }
    console.error("[gmail-send]", msg);
    return json({ error: msg }, 500);
  }
});
