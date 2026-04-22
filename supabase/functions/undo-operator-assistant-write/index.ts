/**
 * JWT-authenticated: bounded undo for audited operator-assistant calendar writes (P4).
 * Body: { auditId: string } — must reference `operator_assistant_write_audit` for this tenant.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { undoOperatorAssistantWrite } from "../_shared/operatorStudioAssistant/undoOperatorAssistantWriteCore.ts";
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

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
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

    const auditId = typeof body.auditId === "string" ? body.auditId.trim() : "";
    if (!auditId || !isUuidLike(auditId)) {
      return json({ error: "auditId must be a UUID string" }, 400);
    }

    const result = await undoOperatorAssistantWrite(supabaseAdmin, photographerId, auditId);
    if (!result.ok) {
      return json({ error: result.error }, result.status);
    }

    return json({
      ok: true as const,
      kind: result.kind,
      clientFacingForbidden: true as const,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || msg.includes("Missing or invalid Authorization")) {
      return json({ error: "Unauthorized" }, 401);
    }
    console.error(JSON.stringify({ type: "undo_operator_assistant_write_failed", message: msg }));
    return json({ error: msg }, 500);
  }
});
