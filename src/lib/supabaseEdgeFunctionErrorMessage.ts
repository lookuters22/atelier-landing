import { FunctionsHttpError } from "@supabase/supabase-js";

type JsonErrorBody = { error?: unknown };

/**
 * For failed `supabase.functions.invoke` calls, reads the edge JSON body `{ error }` when
 * present (e.g. `operator-studio-assistant` validation / internal errors). Falls back to
 * `Error.message` (often the generic "non-2xx" string when the body is not parsed).
 */
export async function getSupabaseEdgeFunctionErrorMessage(
  err: unknown,
  invokeData: unknown,
): Promise<string> {
  if (invokeData !== null && typeof invokeData === "object") {
    const e = (invokeData as JsonErrorBody).error;
    if (typeof e === "string" && e.trim()) {
      return e.trim();
    }
  }
  if (err instanceof FunctionsHttpError) {
    try {
      const j = (await err.context.json()) as JsonErrorBody;
      if (typeof j?.error === "string" && j.error.trim()) {
        return j.error.trim();
      }
    } catch {
      // Response body not JSON or already consumed
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Unknown error";
}
