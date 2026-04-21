/**
 * HTTP status mapping for `operator-studio-assistant` (narrow polish pass).
 */

/** Request validation (client fixable). */
export class OperatorStudioAssistantValidationError extends Error {
  override readonly name = "OperatorStudioAssistantValidationError";
  constructor(message: string) {
    super(message);
  }
}

function isAuthFailureMessage(msg: string): boolean {
  return (
    msg === "Unauthorized" ||
    msg.includes("Missing or invalid Authorization header")
  );
}

/**
 * - 401: JWT / session auth failures from {@link requirePhotographerIdFromJwt}
 * - 400: {@link OperatorStudioAssistantValidationError} (e.g. missing queryText)
 * - 500: internal / dependency failures (DB, context build, misconfigured env, LLM transport, etc.)
 */
export function httpStatusForOperatorStudioAssistantFailure(error: unknown): number {
  if (error instanceof OperatorStudioAssistantValidationError) {
    return 400;
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (isAuthFailureMessage(msg)) {
    return 401;
  }
  return 500;
}
