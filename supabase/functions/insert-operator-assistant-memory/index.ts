/**
 * JWT-authenticated: create a `memories` row from an operator-confirmed assistant memory_note proposal.
 * Scope `project` | `person` | `studio`; satisfies `memories_scope_shape_check`.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { insertMemoryForOperatorAssistant } from "../_shared/operatorStudioAssistant/insertOperatorAssistantMemoryCore.ts";
import { validateOperatorAssistantMemoryPayload } from "../_shared/operatorStudioAssistant/validateOperatorAssistantMemoryPayload.ts";
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

    const validated = validateOperatorAssistantMemoryPayload(body);
    if (!validated.ok) {
      return json({ error: validated.error }, 400);
    }

    const { id, auditId } = await insertMemoryForOperatorAssistant(supabaseAdmin, photographerId, validated.value);

    return json({ memoryId: id, auditEventId: auditId, clientFacingForbidden: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || msg.includes("Missing or invalid Authorization")) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (msg.includes("wedding not found") || msg.includes("person not found")) {
      return json({ error: msg }, 404);
    }
    console.error(JSON.stringify({ type: "insert_operator_assistant_memory_failed", message: msg }));
    return json({ error: msg }, 500);
  }
});
