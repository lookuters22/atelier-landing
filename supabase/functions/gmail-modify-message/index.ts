/**
 * Gmail inbox actions: star / unstar / mark read / mark unread on a canonical message with `provider_message_id`.
 * Updates `messages.metadata.gmail_import.gmail_label_ids` from Gmail API response.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { ensureValidGoogleAccessToken } from "../_shared/gmail/ensureGoogleAccess.ts";
import {
  isGmailInsufficientScopeModifyError,
  modifyGmailMessageLabels,
} from "../_shared/gmail/gmailThreads.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gmail system label ids (users.messages.modify). */
const LABEL_STARRED = "STARRED";
const LABEL_UNREAD = "UNREAD";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type Action = "star" | "unstar" | "mark_read" | "mark_unread";

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "gmail-modify-message",
      action: "method_not_allowed",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 405,
    });
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
    const providerMessageId =
      typeof body.provider_message_id === "string" ? body.provider_message_id.trim() : "";
    const action = body.action as Action;

    if (!connectedAccountId || !UUID_RE.test(connectedAccountId)) {
      return json({ error: "connected_account_id must be a valid UUID" }, 400);
    }
    if (!providerMessageId) {
      return json({ error: "provider_message_id is required" }, 400);
    }
    const validActions: Action[] = ["star", "unstar", "mark_read", "mark_unread"];
    if (!validActions.includes(action)) {
      return json({ error: "action must be star | unstar | mark_read | mark_unread" }, 400);
    }

    const { data: account, error: aErr } = await supabaseAdmin
      .from("connected_accounts")
      .select("id, photographer_id, token_expires_at")
      .eq("id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .eq("provider", "google")
      .maybeSingle();

    if (aErr || !account) {
      logA4EdgeOpLatencyV1({
        edge: "gmail-modify-message",
        action: "connected_account_not_found",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 404,
      });
      return json({ error: "Connected account not found" }, 404);
    }

    const { data: msgRow, error: mErr } = await supabaseAdmin
      .from("messages")
      .select("id, metadata, thread_id")
      .eq("photographer_id", photographerId)
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();

    if (mErr || !msgRow) {
      logA4EdgeOpLatencyV1({
        edge: "gmail-modify-message",
        action: "message_not_found",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 404,
      });
      return json({ error: "Message not found for this Gmail id" }, 404);
    }

    const { data: tok, error: tErr } = await supabaseAdmin
      .from("connected_account_oauth_tokens")
      .select("access_token, refresh_token")
      .eq("connected_account_id", connectedAccountId)
      .maybeSingle();

    if (tErr || !tok?.access_token) {
      return json({ error: "Google tokens not available. Reconnect in Settings." }, 401);
    }

    let addLabelIds: string[] = [];
    let removeLabelIds: string[] = [];
    switch (action) {
      case "star":
        addLabelIds = [LABEL_STARRED];
        break;
      case "unstar":
        removeLabelIds = [LABEL_STARRED];
        break;
      case "mark_read":
        removeLabelIds = [LABEL_UNREAD];
        break;
      case "mark_unread":
        addLabelIds = [LABEL_UNREAD];
        break;
    }

    const ensured = await ensureValidGoogleAccessToken(
      {
        id: account.id as string,
        photographer_id: account.photographer_id as string,
        token_expires_at: account.token_expires_at as string | null,
      },
      { access_token: tok.access_token, refresh_token: tok.refresh_token },
    );

    let modified: { id: string; labelIds: string[] };
    try {
      modified = await modifyGmailMessageLabels(
        ensured.accessToken,
        providerMessageId,
        addLabelIds,
        removeLabelIds,
      );
    } catch (modifyErr) {
      const modifyMsg = modifyErr instanceof Error ? modifyErr.message : String(modifyErr);
      if (isGmailInsufficientScopeModifyError(modifyMsg)) {
        logA4EdgeOpLatencyV1({
          edge: "gmail-modify-message",
          action,
          ok: false,
          duration_ms: Date.now() - startedAt,
          photographer_id: photographerId,
          http_status: 403,
        });
        return json({
          ok: false,
          error_code: "insufficient_gmail_scopes",
          error:
            "Google denied changing this message: the Gmail connection is missing the “modify messages” permission. Open Settings → Integrations and tap Reconnect Gmail to approve the updated access.",
        });
      }
      throw modifyErr;
    }

    const meta = (msgRow.metadata && typeof msgRow.metadata === "object"
      ? (msgRow.metadata as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const giRaw = meta.gmail_import;
    const gi =
      giRaw && typeof giRaw === "object" && giRaw !== null
        ? { ...(giRaw as Record<string, unknown>) }
        : {};
    gi.gmail_label_ids = modified.labelIds;

    const nextMetadata = { ...meta, gmail_import: gi };

    const { error: upErr } = await supabaseAdmin
      .from("messages")
      .update({ metadata: nextMetadata as unknown as Record<string, unknown> })
      .eq("id", msgRow.id)
      .eq("photographer_id", photographerId);

    if (upErr) {
      console.error("[gmail-modify-message] metadata update failed", upErr.message);
      /** Gmail state changed; local cache failed — still return Gmail result so client can refetch. */
    }

    logA4EdgeOpLatencyV1({
      edge: "gmail-modify-message",
      action,
      ok: true,
      duration_ms: Date.now() - startedAt,
      photographer_id: photographerId,
      http_status: 200,
    });

    return json({
      ok: true,
      label_ids: modified.labelIds,
      message_id: msgRow.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logA4EdgeOpLatencyV1({
      edge: "gmail-modify-message",
      action: "error",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 500,
    });
    return json({ error: msg.slice(0, 500) }, 500);
  }
});
