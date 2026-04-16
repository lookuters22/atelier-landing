/**
 * A6: Draft resolution client — thin wrappers around Edge `api-resolve-draft` for approve and reject/rewrite.
 * Callers own toasts and `fireDataChanged()` after success.
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { supabase } from "./supabase";

function isFunctionsClass(e: unknown, name: string): boolean {
  if (e instanceof FunctionsFetchError || e instanceof FunctionsHttpError || e instanceof FunctionsRelayError) {
    return e.name === name;
  }
  return typeof e === "object" && e !== null && (e as { name?: string }).name === name;
}

/** Gateway JWT verify is HS256-oriented; ES256 user sessions fail before the handler unless verify_jwt=false in config.toml. */
const ES256_GATEWAY_AUTH_COPY =
  "Approval failed: this environment rejected your sign-in token (ES256). The dashboard and Edge Functions must target the same Supabase project, and api-resolve-draft must be deployed with verify_jwt disabled for that function so auth runs inside the handler. If you deploy from this repo, run: supabase functions deploy api-resolve-draft";

function isUnsupportedJwtAlgorithmBody(body: Record<string, unknown>): boolean {
  const code = body.code;
  if (code === "UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM") return true;
  const msg = body.message;
  if (typeof msg === "string" && /es256|unsupported jwt algorithm/i.test(msg)) return true;
  return false;
}

/** Maps `supabase.functions.invoke` failures to user-facing copy (parses api-resolve-draft JSON bodies). */
export async function humanizeDraftApprovalInvokeError(error: unknown): Promise<string> {
  if (isFunctionsClass(error, "FunctionsFetchError")) {
    return "Approval could not reach the server. Check your connection and try again.";
  }
  if (isFunctionsClass(error, "FunctionsRelayError")) {
    return "Approval did not complete (network relay). Try again in a moment.";
  }

  if (error instanceof FunctionsHttpError || isFunctionsClass(error, "FunctionsHttpError")) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const status = ctx.status;
      let body: Record<string, unknown> | null = null;
      try {
        body = (await ctx.clone().json()) as Record<string, unknown>;
      } catch {
        body = null;
      }

      if (body && isUnsupportedJwtAlgorithmBody(body)) {
        return ES256_GATEWAY_AUTH_COPY;
      }

      if (body?.action === "approval_rejected_stale_draft" && typeof body.message === "string") {
        return body.message;
      }
      if (status === 409 && typeof body?.message === "string" && String(body.message).trim()) {
        return body.message as string;
      }
      if (body && typeof body.error === "string" && body.error.trim()) {
        if (body.error === "Draft is not pending approval" && typeof body.status === "string") {
          return `This draft is no longer pending (${body.status}). Refresh and try again.`;
        }
        return body.error;
      }

      if (status === 401) {
        return "Your session expired or this action is not allowed. Refresh the page and sign in again.";
      }
      if (status === 403) {
        return "You do not have access to approve this draft.";
      }
      if (status === 404) {
        return "The approval service is unavailable (Edge Function missing or wrong Supabase project). Ensure api-resolve-draft is deployed.";
      }
    }
  }

  const msg = error instanceof Error ? error.message : String(error);
  if (msg.trim()) return msg;
  return "Failed to approve draft. Please try again.";
}

/**
 * Approves a pending draft — same contract as Approvals page (`api-resolve-draft` action `approve`).
 * Emits `approval/draft.approved` after pending + staleness checks (unlike legacy `webhook-approval`).
 */
export async function enqueueDraftApprovedForOutbound(draftId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("api-resolve-draft", {
    body: { draft_id: draftId, action: "approve" },
  });
  if (error) throw error;
}

export type BatchApproveDraftsResult = {
  succeeded: string[];
  failed: { id: string; message: string }[];
};

/**
 * A7: Sequential batch approve — same server contract as repeated single approvals (no parallel blast).
 */
export async function enqueueDraftsApprovedForOutboundBatch(
  draftIds: string[],
  onProgress?: (index: number, total: number) => void,
): Promise<BatchApproveDraftsResult> {
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  const total = draftIds.length;
  let done = 0;
  for (const id of draftIds) {
    try {
      await enqueueDraftApprovedForOutbound(id);
      succeeded.push(id);
      done += 1;
      onProgress?.(done, total);
    } catch (e) {
      const message = await humanizeDraftApprovalInvokeError(e);
      failed.push({ id, message });
    }
  }
  return { succeeded, failed };
}

/**
 * Reject pending draft and request AI rewrite (`api-resolve-draft` action `reject`).
 */
export async function requestDraftRewrite(params: {
  draftId: string;
  feedback: string;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("api-resolve-draft", {
    body: {
      draft_id: params.draftId,
      action: "reject",
      edited_body: "",
      feedback: params.feedback,
    },
  });
  if (error) throw error;
}
