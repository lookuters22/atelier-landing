/**
 * Operator dashboard - "Ask Ana" studio assistant (Mode B).
 *
 * POST JSON: { queryText: string, focusedWeddingId?: string | null, focusedPersonId?: string | null,
 *   escalationResolverEscalationId?: string | null (S1 — pinned escalation UUID for resolver mode),
 *   offerBuilderSpecialistProjectId?: string | null (S2 — pinned studio_offer_builder_projects.id),
 *   invoiceSetupSpecialist?: boolean (S3 — invoice template specialist),
 *   investigationSpecialist?: boolean (S4 — investigation / deep-read; mutually exclusive with S1–S3),
 *   playbookAuditSpecialist?: boolean (S5 — rule authoring / audit; mutually exclusive with S1–S4),
 *   bulkTriageSpecialist?: boolean (S6 — bulk Today / queue triage; mutually exclusive with S1–S5),
 *   conversation?: Array<{ role: "user" | "assistant"; content: string }>,
 *   carryForward?: (Slice 6) prior-turn pointer from the last response }
 *
 * `conversation` is optional, client-only, bounded; passed to the LLM as prior `messages[]` (not stored).
 *
 * Requires Bearer JWT (`photographers.id`). Uses service-role DB with tenant scoping inside
 * {@link buildAssistantContext} - not for anonymous callers.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  handleOperatorStudioAssistantPost,
  parseAndValidateOperatorStudioAssistantRequest,
} from "../_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts";
import {
  httpStatusForOperatorStudioAssistantFailure,
  OperatorStudioAssistantValidationError,
} from "../_shared/operatorStudioAssistant/operatorStudioAssistantHttp.ts";
import { createOperatorStudioAssistantSseResponse, shouldUseOperatorStudioAssistantSse } from "../_shared/operatorStudioAssistant/operatorStudioAssistantSseResponse.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

function normalizeOptionalId(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length > 0 ? t : null;
}

/**
 * Single-line JSON for Supabase / Inngest log drains. No raw query text.
 * Safe focus ids only (for correlation). Stack only on 500-class responses.
 */
function logOperatorStudioAssistantFailure(
  e: unknown,
  ctx: {
    httpStatus: number;
    photographerId?: string;
    focusWeddingId: string | null;
    focusPersonId: string | null;
    logStack: boolean;
  },
): void {
  const message = e instanceof Error ? e.message : String(e);
  const errName = e instanceof Error ? e.name : "non_error_throw";
  const stack = e instanceof Error ? e.stack : undefined;
  const out: Record<string, unknown> = {
    type: "operator_studio_assistant_unhandled",
    message,
    errName,
    httpStatus: ctx.httpStatus,
    photographerId: ctx.photographerId,
    focus: {
      weddingId: ctx.focusWeddingId,
      personId: ctx.focusPersonId,
    },
  };
  if (ctx.logStack && stack) {
    out.stack = stack;
  }
  console.error(JSON.stringify(out));
}

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

  let photographerId: string | undefined;
  let focusWeddingId: string | null = null;
  let focusPersonId: string | null = null;

  try {
    photographerId = await requirePhotographerIdFromJwt(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    focusWeddingId = normalizeOptionalId(body.focusedWeddingId);
    focusPersonId = normalizeOptionalId(body.focusedPersonId);

    const requestBody = {
      queryText: body.queryText as string | undefined,
      focusedWeddingId: (body.focusedWeddingId as string | null | undefined) ?? null,
      focusedPersonId: (body.focusedPersonId as string | null | undefined) ?? null,
      escalationResolverEscalationId: (body.escalationResolverEscalationId as string | null | undefined) ?? null,
      offerBuilderSpecialistProjectId: (body.offerBuilderSpecialistProjectId as string | null | undefined) ?? null,
      invoiceSetupSpecialist: body.invoiceSetupSpecialist === true,
      investigationSpecialist: body.investigationSpecialist === true,
      playbookAuditSpecialist: body.playbookAuditSpecialist === true,
      bulkTriageSpecialist: body.bulkTriageSpecialist === true,
      conversation: body.conversation,
      carryForward: body.carryForward,
    };

    if (shouldUseOperatorStudioAssistantSse(req)) {
      let prevalidated;
      try {
        prevalidated = parseAndValidateOperatorStudioAssistantRequest(requestBody);
      } catch (e) {
        if (e instanceof OperatorStudioAssistantValidationError) {
          return json({ error: e.message }, 400);
        }
        throw e;
      }
      return createOperatorStudioAssistantSseResponse(
        supabaseAdmin,
        photographerId,
        requestBody,
        prevalidated,
        req.signal,
        CORS_HEADERS,
      );
    }

    const result = await handleOperatorStudioAssistantPost(supabaseAdmin, photographerId, requestBody);

    return json(result as unknown as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const status = httpStatusForOperatorStudioAssistantFailure(e);
    const logStack = status >= 500;
    logOperatorStudioAssistantFailure(e, {
      httpStatus: status,
      photographerId,
      focusWeddingId,
      focusPersonId,
      logStack,
    });
    return json({ error: msg }, status);
  }
});
