/**
 * Operator dashboard - "Ask Ana" studio assistant (Mode B).
 *
 * POST JSON: { queryText: string, focusedWeddingId?: string | null, focusedPersonId?: string | null }
 *
 * Requires Bearer JWT (`photographers.id`). Uses service-role DB with tenant scoping inside
 * {@link buildAssistantContext} - not for anonymous callers.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { handleOperatorStudioAssistantPost } from "../_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts";
import { httpStatusForOperatorStudioAssistantFailure } from "../_shared/operatorStudioAssistant/operatorStudioAssistantHttp.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const photographerId = await requirePhotographerIdFromJwt(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const result = await handleOperatorStudioAssistantPost(supabaseAdmin, photographerId, {
      queryText: body.queryText as string | undefined,
      focusedWeddingId: (body.focusedWeddingId as string | null | undefined) ?? null,
      focusedPersonId: (body.focusedPersonId as string | null | undefined) ?? null,
    });

    return json(result as unknown as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const status = httpStatusForOperatorStudioAssistantFailure(e);
    return json({ error: msg }, status);
  }
});
