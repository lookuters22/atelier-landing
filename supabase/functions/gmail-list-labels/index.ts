/**
 * Gmail labels for Settings: returns **cached** `labels.list` snapshot + optional background refresh.
 * Live Gmail API + token refresh run in Inngest (`import/gmail.labels_refresh.v1`), not in this Edge handler.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  GMAIL_LABELS_REFRESH_V1_EVENT,
  GMAIL_LABELS_REFRESH_V1_SCHEMA_VERSION,
  inngest,
} from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ~1h — auto-refresh when cache is older (no `last_error` spam). */
const STALE_MS = 60 * 60 * 1000;
/** If `refresh_in_progress` is stuck (worker never ran / crashed), allow a new enqueue after this. */
const STUCK_REFRESH_MS = 15 * 60 * 1000;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type CacheRow = {
  labels_json: unknown;
  refreshed_at: string | null;
  last_error: string | null;
  refresh_in_progress: boolean;
  updated_at?: string | null;
};

function parseLabelsPayload(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw;
}

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "gmail-list-labels",
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
      logA4EdgeOpLatencyV1({
        edge: "gmail-list-labels",
        action: "invalid_json",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: "Invalid JSON body" }, 400);
    }

    const connectedAccountId =
      typeof body.connected_account_id === "string" ? body.connected_account_id.trim() : "";
    const force = body.force === true;

    const jsonWithLog = (
      bodyOut: Record<string, unknown>,
      status: number,
      obs?: Record<string, unknown>,
    ) => {
      logA4EdgeOpLatencyV1({
        edge: "gmail-list-labels",
        action: "cache_read",
        ok: status < 400,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        connected_account_id: connectedAccountId || undefined,
        http_status: status,
        force,
        ...obs,
      });
      return json(bodyOut, status);
    };

    if (!connectedAccountId || !UUID_RE.test(connectedAccountId)) {
      return jsonWithLog({ error: "connected_account_id must be a valid UUID" }, 400);
    }

    const { data: account, error: aErr } = await supabaseAdmin
      .from("connected_accounts")
      .select("id")
      .eq("id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .eq("provider", "google")
      .maybeSingle();

    if (aErr || !account) {
      return jsonWithLog({ error: "Connected account not found" }, 404, {
        outcome: "connected_account_not_found",
      });
    }

    const { data: cache } = await supabaseAdmin
      .from("connected_account_gmail_label_cache")
      .select("labels_json, refreshed_at, last_error, refresh_in_progress, updated_at")
      .eq("connected_account_id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    let row = cache as CacheRow | null;
    const now = Date.now();
    const stale =
      !row?.refreshed_at || now - new Date(row.refreshed_at).getTime() > STALE_MS;

    const stuckInProgress =
      Boolean(row?.refresh_in_progress) &&
      row?.updated_at != null &&
      now - new Date(row.updated_at).getTime() > STUCK_REFRESH_MS;

    if (stuckInProgress) {
      const ts = new Date().toISOString();
      await supabaseAdmin
        .from("connected_account_gmail_label_cache")
        .update({
          refresh_in_progress: false,
          last_error: "Previous label refresh did not finish — cleared stale in-progress flag. Retry refresh.",
          updated_at: ts,
        })
        .eq("connected_account_id", connectedAccountId)
        .eq("photographer_id", photographerId);
      row = row
        ? { ...row, refresh_in_progress: false, last_error: "Previous label refresh did not finish — retrying.", updated_at: ts }
        : row;
    }

    /** Allow enqueue when not in progress, when `force`, or when a stale in-progress flag was cleared above. */
    const canEnqueue = !row?.refresh_in_progress || force;

    const shouldEnqueue =
      canEnqueue &&
      (force ||
        !row ||
        (!row.last_error && (!row.refreshed_at || stale)));

    let queued = false;
    if (shouldEnqueue) {
      const ts = new Date().toISOString();
      const { error: upErr } = await supabaseAdmin.from("connected_account_gmail_label_cache").upsert(
        {
          connected_account_id: connectedAccountId,
          photographer_id: photographerId,
          labels_json: row?.labels_json != null ? parseLabelsPayload(row.labels_json) : [],
          refresh_in_progress: true,
          last_error: null,
          updated_at: ts,
        },
        { onConflict: "connected_account_id" },
      );

      if (upErr) {
        return jsonWithLog({ error: upErr.message }, 500, { stage: "cache_upsert" });
      }

      try {
        await inngest.send({
          name: GMAIL_LABELS_REFRESH_V1_EVENT,
          data: {
            schemaVersion: GMAIL_LABELS_REFRESH_V1_SCHEMA_VERSION,
            photographerId,
            connectedAccountId,
          },
        });
        queued = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[gmail-list-labels] inngest send failed", msg);
        await supabaseAdmin
          .from("connected_account_gmail_label_cache")
          .update({
            refresh_in_progress: false,
            last_error: `Could not queue label refresh: ${msg}`.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("connected_account_id", connectedAccountId)
          .eq("photographer_id", photographerId);
        return jsonWithLog({ error: "enqueue_failed", detail: msg }, 500, { stage: "inngest_send" });
      }
    }

    const { data: fresh } = await supabaseAdmin
      .from("connected_account_gmail_label_cache")
      .select("labels_json, refreshed_at, last_error, refresh_in_progress")
      .eq("connected_account_id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    const out = (fresh ?? row) as CacheRow | null;
    const labels = parseLabelsPayload(out?.labels_json);

    return jsonWithLog(
      {
        labels,
        cache: {
          refreshed_at: out?.refreshed_at ?? null,
          last_error: out?.last_error ?? null,
          refresh_in_progress: Boolean(out?.refresh_in_progress),
          queued,
        },
      },
      200,
      {
        labels_count: labels.length,
        queued,
        refresh_in_progress: Boolean(out?.refresh_in_progress),
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      logA4EdgeOpLatencyV1({
        edge: "gmail-list-labels",
        action: "auth",
        ok: false,
        duration_ms: Date.now() - wallStartedAt,
        http_status: 401,
        outcome: msg,
      });
      return json({ error: msg }, 401);
    }
    console.error("[gmail-list-labels]", msg);
    logA4EdgeOpLatencyV1({
      edge: "gmail-list-labels",
      action: "exception",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 500,
      outcome: msg,
    });
    return json({ error: msg }, 500);
  }
});
