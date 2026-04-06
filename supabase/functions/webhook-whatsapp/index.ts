/**
 * Twilio WhatsApp webhook — **operator lane only** (execute_v3 Phase 8 Step 8B).
 *
 * - Resolves tenant from the **studio inbound number** (`To`) vs `photographers.settings.whatsapp_number`.
 * - Verifies the **sender** (`From`) matches `settings.admin_mobile_number` (normalized).
 * - Non-operator senders: 200 + `ignored` (no Inngest, no message row) — client WhatsApp is out of scope here.
 * - Operator senders: persist `raw_payload` (+ attachment URLs from Twilio fields) on `messages`, emit
 *   `operator/whatsapp.inbound.v1` only (Step 8D: never `comms/whatsapp.*` or `client/whatsapp.*`).
 */
import {
  inngest,
  WHATSAPP_OPERATOR_INBOUND_V1_EVENT,
  WHATSAPP_OPERATOR_V1_SCHEMA_VERSION,
} from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyTwilioWebhookSignature } from "../_shared/twilio.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const OPERATOR_THREAD_EXTERNAL_KEY = "operator_whatsapp_inbound" as const;

/** URL Twilio signed (respect proxy headers so it matches the console webhook URL). */
function twilioWebhookFullUrl(req: Request): string {
  const u = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()?.replace(/:$/, "") ??
    u.protocol.replace(":", "") ??
    "https";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** E.164-friendly: strip whatsapp: prefix and common separators. */
function normalizePhone(raw: string): string {
  return raw
    .replace(/^whatsapp:/i, "")
    .replace(/[\s\-\(\)\.]/g, "")
    .trim();
}

function digitsCore(s: string): string {
  return s.replace(/\D/g, "");
}

/** Compare normalized inbound `from` to stored `admin_mobile_number` (may omit country code). */
function isOperatorSender(normalizedFrom: string, rawAdminMobile: string): boolean {
  const admin = normalizePhone(rawAdminMobile);
  if (!normalizedFrom || !admin) return false;
  if (normalizedFrom === admin) return true;
  const df = digitsCore(normalizedFrom);
  const da = digitsCore(admin);
  if (df.length >= 7 && da.length >= 7 && (df === da || df.endsWith(da) || da.endsWith(df))) {
    return true;
  }
  return normalizedFrom.endsWith(admin) || admin.endsWith(normalizedFrom);
}

function collectTwilioAttachmentMeta(rec: Record<string, string>): Array<{
  index: string;
  url: string | undefined;
  contentType: string | undefined;
}> {
  const n = parseInt(rec.NumMedia ?? "0", 10) || 0;
  const out: Array<{ index: string; url: string | undefined; contentType: string | undefined }> = [];
  for (let i = 0; i < n; i++) {
    const idx = String(i);
    out.push({
      index: idx,
      url: rec[`MediaUrl${i}`],
      contentType: rec[`MediaContentType${i}`],
    });
  }
  return out;
}

async function resolvePhotographerByStudioNumber(toNumber: string): Promise<{
  id: string;
  settings: Record<string, unknown>;
} | null> {
  if (!toNumber) return null;

  const { data: row } = await supabaseAdmin
    .from("photographers")
    .select("id, settings")
    .eq("settings->>whatsapp_number", toNumber)
    .limit(1)
    .maybeSingle();

  if (row?.id) {
    return { id: row.id as string, settings: (row.settings ?? {}) as Record<string, unknown> };
  }

  const { data: all } = await supabaseAdmin
    .from("photographers")
    .select("id, settings")
    .not("settings", "is", null);

  if (!all) return null;

  for (const p of all) {
    const settings = (p.settings ?? {}) as Record<string, unknown>;
    const stored = normalizePhone(String(settings.whatsapp_number ?? ""));
    if (!stored) continue;
    if (toNumber === stored || toNumber.endsWith(stored) || stored.endsWith(toNumber)) {
      return { id: p.id as string, settings };
    }
  }
  return null;
}

async function ensureOperatorInboundThread(photographerId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", "whatsapp_operator")
    .eq("external_thread_key", OPERATOR_THREAD_EXTERNAL_KEY)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabaseAdmin
    .from("threads")
    .insert({
      photographer_id: photographerId,
      title: "Operator WhatsApp",
      kind: "other",
      channel: "whatsapp_operator",
      external_thread_key: OPERATOR_THREAD_EXTERNAL_KEY,
      wedding_id: null,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`ensureOperatorInboundThread: ${error?.message ?? "insert failed"}`);
  }
  return created.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respond({ ok: true });

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const contentType = req.headers.get("content-type") ?? "";
    console.log("[webhook-whatsapp] Content-Type:", contentType);

    const skipVerify =
      Deno.env.get("TWILIO_WEBHOOK_VERIFY_SKIP") === "true" ||
      Deno.env.get("TWILIO_WEBHOOK_VERIFY_SKIP") === "1";

    let rawPayload: Record<string, unknown>;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const rec: Record<string, string> = {};
      const params = new URLSearchParams(rawBody);
      params.forEach((v, k) => {
        rec[k] = v;
      });

      if (!skipVerify) {
        const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        if (!authToken) {
          console.warn("[webhook-whatsapp] TWILIO_AUTH_TOKEN missing; rejecting webhook");
          return respond({ error: "webhook_auth_not_configured" }, 401);
        }
        const sig =
          req.headers.get("X-Twilio-Signature") ?? req.headers.get("x-twilio-signature");
        const ok = await verifyTwilioWebhookSignature(twilioWebhookFullUrl(req), rec, sig, authToken);
        if (!ok) {
          console.warn("[webhook-whatsapp] Twilio signature verification failed");
          return respond({ error: "invalid_twilio_signature" }, 403);
        }
      } else {
        console.warn("[webhook-whatsapp] TWILIO_WEBHOOK_VERIFY_SKIP set — signature verification skipped");
      }

      rawPayload = { ...rec, _format: "twilio_form" as const };
    } else {
      if (!skipVerify) {
        return respond({ error: "invalid_or_unsupported_webhook_request" }, 403);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return respond({ error: "invalid_json" }, 400);
      }
      console.log("[webhook-whatsapp] Raw JSON payload keys:", Object.keys(json));
      rawPayload = { ...json, _format: "json" as const };
    }

    let rawFrom = "";
    let rawTo = "";
    let messageBody = "";

    if (rawPayload._format === "twilio_form") {
      const rec = rawPayload as unknown as Record<string, string>;
      rawFrom = rec.From ?? "";
      rawTo = rec.To ?? "";
      messageBody = rec.Body ?? "";
    } else {
      rawFrom = String(
        rawPayload.From ?? rawPayload.from ?? rawPayload.from_number ?? "",
      );
      rawTo = String(rawPayload.To ?? rawPayload.to ?? rawPayload.to_number ?? "");
      messageBody = String(rawPayload.Body ?? rawPayload.body ?? rawPayload.message ?? "");
    }

    const fromNumber = normalizePhone(rawFrom);
    const toNumber = normalizePhone(rawTo);

    console.log(
      "[webhook-whatsapp] Parsed -> from:",
      fromNumber,
      "to:",
      toNumber,
      "body length:",
      messageBody.length,
    );

    if (!fromNumber || !messageBody) {
      console.warn("[webhook-whatsapp] Missing From or Body, returning 400");
      return respond({ error: "Missing From or Body" }, 400);
    }

    const resolved = await resolvePhotographerByStudioNumber(toNumber);
    if (!resolved) {
      console.warn(`[webhook-whatsapp] No photographer for studio To=${toNumber}`);
      return respond({ ok: true, warning: "no_matching_photographer", to: toNumber });
    }

    const photographerId = resolved.id;
    const adminMobile = String(resolved.settings.admin_mobile_number ?? "").trim();

    if (!adminMobile) {
      console.warn(`[webhook-whatsapp] admin_mobile_number not set for photographer ${photographerId}`);
      return respond({
        ok: true,
        ignored: true,
        reason: "admin_mobile_not_configured",
        photographer_id: photographerId,
      });
    }

    if (!isOperatorSender(fromNumber, adminMobile)) {
      console.warn(
        `[webhook-whatsapp] Ignoring non-operator sender from=${fromNumber} (admin_mobile normalized mismatch)`,
      );
      return respond({
        ok: true,
        ignored: true,
        reason: "sender_not_operator",
        photographer_id: photographerId,
      });
    }

    const threadId = await ensureOperatorInboundThread(photographerId);

    const formAsStrings = rawPayload as unknown as Record<string, string>;
    const attachments =
      rawPayload._format === "twilio_form"
        ? collectTwilioAttachmentMeta(formAsStrings)
        : [];

    const rawPayloadForDb: Record<string, unknown> = {
      ...rawPayload,
      _parsed: { from: fromNumber, to: toNumber, body: messageBody },
      attachments,
    };

    const providerMessageId =
      typeof formAsStrings.MessageSid === "string"
        ? formAsStrings.MessageSid
        : typeof rawPayload.MessageSid === "string"
          ? (rawPayload.MessageSid as string)
          : null;

    if (providerMessageId) {
      const { data: dup } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("idempotency_key", providerMessageId)
        .maybeSingle();
      if (dup?.id) {
        console.log("[webhook-whatsapp] Deduped webhook retry for", providerMessageId);
        return respond({ ok: true, deduped: true, message_id: dup.id as string });
      }
    }

    const { data: msgRow, error: msgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "in",
        sender: fromNumber,
        body: messageBody,
        raw_payload: rawPayloadForDb,
        provider_message_id: providerMessageId,
        idempotency_key: providerMessageId,
      })
      .select("id")
      .single();

    if (msgErr || !msgRow) {
      console.error("[webhook-whatsapp] messages insert failed:", msgErr?.message);
      return respond({ error: "persist_failed" }, 500);
    }

    const messageId = msgRow.id as string;

    for (const a of attachments) {
      if (!a.url) continue;
      await supabaseAdmin.from("message_attachments").insert({
        message_id: messageId,
        photographer_id: photographerId,
        kind: "attachment",
        source_url: a.url,
        mime_type: a.contentType ?? null,
        metadata: { twilio_index: a.index },
      });
    }

    await supabaseAdmin
      .from("threads")
      .update({ last_inbound_at: new Date().toISOString() })
      .eq("id", threadId);

    const sendResult = await inngest.send({
      name: WHATSAPP_OPERATOR_INBOUND_V1_EVENT,
      data: {
        schemaVersion: WHATSAPP_OPERATOR_V1_SCHEMA_VERSION,
        photographerId,
        operatorFromNumber: fromNumber,
        rawMessage: messageBody,
        lane: "operator",
      },
    });

    console.log("[webhook-whatsapp] Inngest send:", JSON.stringify(sendResult));

    return respond({ ok: true, photographer_id: photographerId, message_id: messageId });
  } catch (err) {
    console.error("[webhook-whatsapp] Unhandled error:", err);
    return respond({ error: "Internal error" }, 500);
  }
});
