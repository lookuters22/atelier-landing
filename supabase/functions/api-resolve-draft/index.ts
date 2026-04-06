/**
 * Resolution API Bridge — approves or rejects a pending draft.
 *
 * POST { draft_id, action: "approve" | "reject", edited_body?: string, feedback?: string }
 *
 * Approve: verifies JWT, emits approval/draft.approved (atomic claim + send happens in Outbound).
 * Reject: verifies JWT and thread ownership before updating the draft.
 *
 * **execute_v3 Step 7C — stale draft:** if `threads.last_inbound_at > drafts.created_at`, approval is
 * rejected, the draft is set to `rejected` (invalidated), and no `approval/draft.approved` event is sent.
 */
import { supabaseAdmin } from "../_shared/supabase.ts";
import { inngest } from "../_shared/inngest.ts";
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { isDraftStaleForApproval } from "../_shared/isDraftStaleForApproval.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function assertDraftOwnedByPhotographer(
  draftId: string,
  photographerId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("drafts")
    .select("id, threads!inner(photographer_id)")
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  const thread = data.threads as unknown as { photographer_id: string };
  return thread.photographer_id === photographerId;
}

type DraftForApprovalRow = {
  id: string;
  created_at: string;
  status: string;
  threads: { photographer_id: string; last_inbound_at: string | null };
};

async function loadDraftForApprove(
  draftId: string,
  photographerId: string,
): Promise<DraftForApprovalRow | null> {
  const { data, error } = await supabaseAdmin
    .from("drafts")
    .select("id, created_at, status, threads!inner(photographer_id, last_inbound_at)")
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  const row = data as unknown as DraftForApprovalRow;
  if (row.threads.photographer_id !== photographerId) {
    return null;
  }
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const photographerId = await requirePhotographerIdFromJwt(req);
    const { draft_id, action, edited_body, feedback } = await req.json();

    if (!draft_id || !action) {
      return json({ error: "draft_id and action are required" }, 400);
    }

    if (action === "approve") {
      const draftRow = await loadDraftForApprove(draft_id, photographerId);
      if (!draftRow) {
        return json({ error: "Draft not found or access denied" }, 403);
      }
      if (draftRow.status !== "pending_approval") {
        return json(
          { error: "Draft is not pending approval", status: draftRow.status },
          409,
        );
      }

      const lastInbound = draftRow.threads.last_inbound_at;
      if (isDraftStaleForApproval(lastInbound, draftRow.created_at)) {
        const { error: invErr } = await supabaseAdmin
          .from("drafts")
          .update({ status: "rejected" })
          .eq("id", draft_id)
          .eq("status", "pending_approval");

        if (invErr) {
          return json({ error: invErr.message }, 500);
        }

        return json(
          {
            ok: false,
            action: "approval_rejected_stale_draft",
            error: "stale_draft",
            message:
              "New client message arrived after this draft was created. This draft was invalidated so nothing is sent. Ana should re-evaluate with the latest thread context.",
          },
          409,
        );
      }

      await inngest.send({
        name: "approval/draft.approved",
        data: {
          draft_id,
          photographer_id: photographerId,
          edited_body: typeof edited_body === "string" ? edited_body : null,
        },
      });

      return json({ ok: true, action: "approved" });
    }

    const owned = await assertDraftOwnedByPhotographer(draft_id, photographerId);
    if (!owned) {
      return json({ error: "Draft not found or access denied" }, 403);
    }

    if (action === "reject") {
      const { error: updateErr } = await supabaseAdmin
        .from("drafts")
        .update({ status: "processing_rewrite" })
        .eq("id", draft_id)
        .eq("status", "pending_approval");

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      await inngest.send({
        name: "ai/draft.rewrite_requested",
        data: { draft_id, feedback: feedback ?? "" },
      });

      return json({ ok: true, action: "rewrite_requested" });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    if (msg === "Unauthorized" || msg.includes("Authorization") || msg.includes("Missing")) {
      return json({ error: msg }, 401);
    }
    return json({ error: "Invalid request body" }, 400);
  }
});
