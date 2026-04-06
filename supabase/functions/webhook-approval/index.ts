/**
 * Approval Webhook — fires the approval/draft.approved event.
 *
 * Requires a valid Supabase JWT. Photographer tenant id is taken from `auth.getUser()`,
 * not from the request body (prevents client spoofing).
 *
 * Service-role ownership check: draft must belong to a thread owned by the JWT user
 * (same pattern as `api-resolve-draft`).
 */
import { inngest } from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";

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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await req.json();
    const draft_id = body.draft_id as string | undefined;

    if (!draft_id) {
      return new Response(JSON.stringify({ error: "draft_id is required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const photographer_id = await requirePhotographerIdFromJwt(req);

    const owned = await assertDraftOwnedByPhotographer(draft_id, photographer_id);
    if (!owned) {
      return new Response(JSON.stringify({ error: "Draft not found or access denied" }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    await inngest.send({
      name: "approval/draft.approved",
      data: { draft_id, photographer_id, edited_body: null },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const authFail =
      msg.includes("Unauthorized") ||
      msg.includes("Authorization") ||
      msg.includes("Missing SUPABASE");
    return new Response(JSON.stringify({ error: msg }), {
      status: authFail ? 401 : 400,
      headers: CORS_HEADERS,
    });
  }
});
