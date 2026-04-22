/**
 * JWT-authenticated: create a `playbook_rule_candidates` row from an operator-confirmed assistant proposal.
 * Does **not** write to `playbook_rules` — promotion stays on `review_playbook_rule_candidate`.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { insertPlaybookRuleCandidateForOperatorAssistant } from "../_shared/operatorStudioAssistant/insertOperatorAssistantPlaybookRuleCandidateCore.ts";
import { validatePlaybookRuleCandidatePayload } from "../_shared/operatorStudioAssistant/validatePlaybookRuleCandidatePayload.ts";
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

    const validated = validatePlaybookRuleCandidatePayload(body);
    if (!validated.ok) {
      return json({ error: validated.error }, 400);
    }

    const { id, auditId } = await insertPlaybookRuleCandidateForOperatorAssistant(
      supabaseAdmin,
      photographerId,
      validated.value,
    );

    return json({ candidateId: id, auditEventId: auditId, clientFacingForbidden: true as const });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || msg.includes("Missing or invalid Authorization")) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (msg.includes("wedding not found")) {
      return json({ error: msg }, 404);
    }
    console.error(JSON.stringify({ type: "insert_operator_assistant_playbook_rule_candidate_failed", message: msg }));
    return json({ error: msg }, 500);
  }
});
