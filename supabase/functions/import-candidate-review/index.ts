/**
 * Approve or dismiss a staged `import_candidate`. Approve materializes a canonical thread
 * (same model as Inbox "Unfiled") with Gmail provenance in `ai_routing_metadata`.
 *
 * G2: When `materialization_prepare_status === 'prepared'`, approval consumes `materialization_artifact`
 * (no Gmail thread fetch / HTML asset pipeline on the click). Otherwise falls back to inline preparation.
 *
 * G5: `approve_group` enqueues chunked Inngest work (no long synchronous materialization here).
 * `dismiss_group` — one Gmail label batch dismissed.
 *
 * A3: A single-row `approve` (unfiled) enqueues `import/gmail.single_candidate_approve.v1` — materialization
 * is not done on the Edge request. Rows with `materialized_thread_id` already set still finalize synchronously (fast).
 */
import { executeSingleImportCandidateApprove } from "../_shared/gmail/executeSingleImportCandidateApprove.ts";
import {
  GMAIL_LABEL_GROUP_APPROVE_V1_EVENT,
  GMAIL_LABEL_GROUP_APPROVE_V1_SCHEMA_VERSION,
  GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_EVENT,
  GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_SCHEMA_VERSION,
  inngest,
} from "../_shared/inngest.ts";
import { logGmailImportEdgeV1 } from "../_shared/gmail/gmailImportObservability.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
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

const CANDIDATE_SELECT =
  "id, photographer_id, connected_account_id, status, raw_provider_thread_id, subject, snippet, source_label_name, source_identifier, materialized_thread_id, materialization_prepare_status, materialization_artifact, gmail_label_import_group_id";

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "import-candidate-review",
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
        edge: "import-candidate-review",
        action: "invalid_json",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: "Invalid JSON body" }, 400);
    }

    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    const jsonWithLog = (
      bodyOut: Record<string, unknown>,
      status: number,
      obs?: Record<string, unknown>,
    ) => {
      logA4EdgeOpLatencyV1({
        edge: "import-candidate-review",
        action: action || "unknown",
        ok: status < 400,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: status,
        ...obs,
      });
      return json(bodyOut, status);
    };

    /** ── G5: retry remaining pending rows after partial failure or chunk-limit truncation (same wedding, re-queued worker) ── */
    if (action === "retry_group_failed") {
      const groupId =
        typeof body.gmail_label_import_group_id === "string"
          ? body.gmail_label_import_group_id.trim()
          : "";
      if (!groupId || !UUID_RE.test(groupId)) {
        return jsonWithLog({ error: "gmail_label_import_group_id must be a valid UUID" }, 400);
      }

      const { data: group, error: gErr } = await supabaseAdmin
        .from("gmail_label_import_groups")
        .select("id, status, materialized_wedding_id, source_label_name")
        .eq("id", groupId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (gErr || !group) {
        return jsonWithLog({ error: "Group not found" }, 404);
      }

      if (group.status !== "partially_approved" && group.status !== "failed") {
        return jsonWithLog(
          { error: "group_not_retryable", status: group.status },
          409,
        );
      }

      if (!group.materialized_wedding_id) {
        return jsonWithLog({ error: "missing_wedding_for_group" }, 400);
      }

      const { data: pendingRows, error: pErr } = await supabaseAdmin
        .from("import_candidates")
        .select("id")
        .eq("gmail_label_import_group_id", groupId)
        .eq("photographer_id", photographerId)
        .eq("status", "pending");

      if (pErr) {
        return jsonWithLog({ error: pErr.message }, 500);
      }

      const pendingList = pendingRows ?? [];
      if (pendingList.length === 0) {
        return jsonWithLog({ error: "no_pending_rows_to_retry" }, 400);
      }

      const now = new Date().toISOString();

      await supabaseAdmin
        .from("import_candidates")
        .update({ import_approval_error: null, updated_at: now })
        .eq("gmail_label_import_group_id", groupId)
        .eq("photographer_id", photographerId)
        .eq("status", "pending");

      const retryTotal = pendingList.length;

      const { error: upG } = await supabaseAdmin
        .from("gmail_label_import_groups")
        .update({
          status: "approving",
          approval_total_candidates: retryTotal,
          approval_processed_count: 0,
          approval_approved_count: 0,
          approval_failed_count: 0,
          approval_last_error: null,
          approval_failed_detail: [],
          updated_at: now,
        })
        .eq("id", groupId)
        .eq("photographer_id", photographerId)
        .in("status", ["partially_approved", "failed"]);

      if (upG) {
        return jsonWithLog({ error: upG.message }, 500);
      }

      try {
        await inngest.send({
          name: GMAIL_LABEL_GROUP_APPROVE_V1_EVENT,
          data: {
            schemaVersion: GMAIL_LABEL_GROUP_APPROVE_V1_SCHEMA_VERSION,
            photographerId,
            gmailLabelImportGroupId: groupId,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[import-candidate-review] retry_group_failed inngest send", msg);
        await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({
            status: "failed",
            approval_last_error: `Could not queue retry: ${msg}`.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", groupId)
          .eq("photographer_id", photographerId);
        return jsonWithLog({ error: "enqueue_failed", detail: msg }, 500);
      }

      logGmailImportEdgeV1({
        stage: "retry_group_queued",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        total_candidates: retryTotal,
        wedding_id: group.materialized_wedding_id as string,
      });
      return jsonWithLog({
        ok: true as const,
        action: "retry_group_queued" as const,
        weddingId: group.materialized_wedding_id as string,
        gmailLabelImportGroupId: groupId,
        totalCandidates: retryTotal,
        message:
          "Retry queued — remaining staged threads will be processed in the background.",
      });
    }

    /** ── G5 grouped: enqueue async materialization (chunked in Inngest) ── */
    if (action === "approve_group" || action === "dismiss_group") {
      const groupId =
        typeof body.gmail_label_import_group_id === "string"
          ? body.gmail_label_import_group_id.trim()
          : "";
      if (!groupId || !UUID_RE.test(groupId)) {
        return jsonWithLog({ error: "gmail_label_import_group_id must be a valid UUID" }, 400);
      }

      const { data: group, error: gErr } = await supabaseAdmin
        .from("gmail_label_import_groups")
        .select("id, status, source_label_name, connected_account_id, materialized_wedding_id")
        .eq("id", groupId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (gErr || !group) {
        return jsonWithLog({ error: "Group not found" }, 404);
      }

      if (group.status !== "pending") {
        return jsonWithLog(
          { error: "group_not_pending", status: group.status },
          409,
        );
      }

      const now = new Date().toISOString();

      if (action === "dismiss_group") {
        const { data: pendingRows } = await supabaseAdmin
          .from("import_candidates")
          .select("id")
          .eq("gmail_label_import_group_id", groupId)
          .eq("photographer_id", photographerId)
          .eq("status", "pending");

        const ids = (pendingRows ?? []).map((r) => r.id as string);
        if (ids.length > 0) {
          await supabaseAdmin
            .from("import_candidates")
            .update({ status: "dismissed", updated_at: now })
            .in("id", ids)
            .eq("photographer_id", photographerId);
        }

        const { error: gu } = await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({ status: "dismissed", updated_at: now })
          .eq("id", groupId)
          .eq("photographer_id", photographerId);

        if (gu) {
          return jsonWithLog({ error: gu.message }, 500);
        }
        logGmailImportEdgeV1({
          stage: "dismiss_group",
          photographer_id: photographerId,
          gmail_label_import_group_id: groupId,
          total_candidates: ids.length,
        });
        return jsonWithLog({ ok: true as const, action: "dismissed_group" as const, dismissed_count: ids.length });
      }

      /** approve_group — queue chunked worker */
      const { count: pendingCount, error: cntErr } = await supabaseAdmin
        .from("import_candidates")
        .select("id", { count: "exact", head: true })
        .eq("gmail_label_import_group_id", groupId)
        .eq("photographer_id", photographerId)
        .eq("status", "pending")
        .is("import_approval_error", null);

      if (cntErr) {
        return jsonWithLog({ error: cntErr.message }, 500);
      }

      const total = pendingCount ?? 0;
      if (total === 0) {
        return jsonWithLog({ error: "no_pending_candidates_in_group" }, 400);
      }

      /**
       * G5+ suppression: do NOT pre-create the batch inquiry wedding here.
       * If every candidate in this group is promotional / system / non-client
       * (Promotions / Newsletters labels, OTA blasts, do-not-reply notifications),
       * creating the wedding now would leave a fake inquiry-stage shell in CRM
       * even after every candidate is suppressed.
       *
       * The async worker (`processGmailLabelGroupApproval`) lazily creates the
       * wedding the first time it encounters a non-suppressed candidate. If
       * none exists, no wedding is ever created.
       */
      const { error: upG } = await supabaseAdmin
        .from("gmail_label_import_groups")
        .update({
          status: "approving",
          materialized_wedding_id: null,
          approval_total_candidates: total,
          approval_processed_count: 0,
          approval_approved_count: 0,
          approval_failed_count: 0,
          approval_last_error: null,
          approval_failed_detail: [],
          updated_at: now,
        })
        .eq("id", groupId)
        .eq("photographer_id", photographerId)
        .eq("status", "pending");

      if (upG) {
        return jsonWithLog({ error: upG.message }, 500);
      }

      try {
        await inngest.send({
          name: GMAIL_LABEL_GROUP_APPROVE_V1_EVENT,
          data: {
            schemaVersion: GMAIL_LABEL_GROUP_APPROVE_V1_SCHEMA_VERSION,
            photographerId,
            gmailLabelImportGroupId: groupId,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[import-candidate-review] inngest send failed", msg);
        await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({
            status: "failed",
            approval_last_error: `Could not queue background approval: ${msg}`.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", groupId)
          .eq("photographer_id", photographerId);
        return jsonWithLog({ error: "enqueue_failed", detail: msg }, 500);
      }

      logGmailImportEdgeV1({
        stage: "approve_group_queued",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        total_candidates: total,
        /**
         * Wedding is created lazily by the worker. Absence here is the
         * deliberate signal that no inquiry shell exists yet for this batch.
         */
      });
      return jsonWithLog({
        ok: true as const,
        action: "approved_group_queued" as const,
        weddingId: null,
        gmailLabelImportGroupId: groupId,
        totalCandidates: total,
        message:
          "Batch approval is running in the background. Progress updates on this page; you can leave and return.",
      });
    }

    /** ── Per-candidate approve / dismiss ── */
    const importCandidateId =
      typeof body.import_candidate_id === "string" ? body.import_candidate_id.trim() : "";
    if (!importCandidateId || !UUID_RE.test(importCandidateId)) {
      return jsonWithLog({ error: "import_candidate_id must be a valid UUID" }, 400);
    }
    if (action !== "approve" && action !== "dismiss") {
      return jsonWithLog(
        {
          error:
            "action must be approve, dismiss, approve_group, dismiss_group, or retry_group_failed",
        },
        400,
      );
    }

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("import_candidates")
      .select(CANDIDATE_SELECT)
      .eq("id", importCandidateId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (fetchErr || !row) {
      return jsonWithLog({ error: "Import candidate not found" }, 404);
    }

    if (row.status !== "pending") {
      return jsonWithLog(
        {
          error: "candidate_not_pending",
          status: row.status,
          materialized_thread_id: row.materialized_thread_id ?? null,
        },
        409,
      );
    }

    const now = new Date().toISOString();

    if (action === "dismiss") {
      const { error: upErr } = await supabaseAdmin
        .from("import_candidates")
        .update({ status: "dismissed", updated_at: now })
        .eq("id", importCandidateId)
        .eq("photographer_id", photographerId);
      if (upErr) {
        console.error("[import-candidate-review] dismiss", upErr.message);
        return jsonWithLog({ error: upErr.message }, 500);
      }
      logGmailImportEdgeV1({
        stage: "dismiss_single",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
      });
      return jsonWithLog({ ok: true as const, action: "dismissed" as const });
    }

    /** approve (single — unfiled): fast path when thread already linked; else queue Inngest. */
    if (row.materialized_thread_id) {
      const r = await executeSingleImportCandidateApprove(supabaseAdmin, {
        photographerId,
        importCandidateId,
        row: row as Record<string, unknown>,
        now,
      });
      if (!r.ok) {
        return jsonWithLog({ error: r.error }, 500);
      }
      logGmailImportEdgeV1({
        stage: "approve_single",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
      });
      return jsonWithLog(
        { ok: true as const, action: "approved" as const, threadId: r.threadId },
        200,
        { path: "approve_finalize_sync" },
      );
    }

    const { data: locked, error: lockErr } = await supabaseAdmin
      .from("import_candidates")
      .update({ status: "approving", import_approval_error: null, updated_at: now })
      .eq("id", importCandidateId)
      .eq("photographer_id", photographerId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (lockErr) {
      return jsonWithLog({ error: lockErr.message }, 500);
    }
    if (!locked) {
      return jsonWithLog(
        { error: "candidate_not_pending", status: row.status },
        409,
      );
    }

    try {
      await inngest.send({
        name: GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_EVENT,
        data: {
          schemaVersion: GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_SCHEMA_VERSION,
          photographerId,
          importCandidateId,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[import-candidate-review] single approve inngest send", msg);
      await supabaseAdmin
        .from("import_candidates")
        .update({
          status: "pending",
          import_approval_error: `Could not queue approval: ${msg}`.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", importCandidateId)
        .eq("photographer_id", photographerId);
      return jsonWithLog({ error: "enqueue_failed", detail: msg }, 500);
    }

    logGmailImportEdgeV1({
      stage: "approve_single_queued",
      photographer_id: photographerId,
      import_candidate_id: importCandidateId,
    });
    return jsonWithLog({
      ok: true as const,
      action: "approve_queued" as const,
      importCandidateId,
      message:
        "Approval is running in the background. Status updates on this page; you can leave and return.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      logA4EdgeOpLatencyV1({
        edge: "import-candidate-review",
        action: "auth",
        ok: false,
        duration_ms: Date.now() - wallStartedAt,
        http_status: 401,
        outcome: msg,
      });
      return json({ error: msg }, 401);
    }
    console.error("[import-candidate-review]", msg);
    logA4EdgeOpLatencyV1({
      edge: "import-candidate-review",
      action: "exception",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 500,
      outcome: msg,
    });
    return json({ error: msg }, 500);
  }
});
