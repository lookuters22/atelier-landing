/**
 * Shared `fetch` wrapper with wall-clock timeout + optional caller `AbortSignal` composition.
 * Only `FetchTimeoutError` (`name === "TimeoutError"`) represents the helper's own timeout.
 * External cancellation preserves `signal.reason` when available.
 */

export class FetchTimeoutError extends Error {
  override name = "TimeoutError";
  constructor(message = "Request timed out") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 30_000;

const TIMEOUT_REASON = Symbol("fetchWithTimeoutTimeout");

/** Merge abort signals into one (AbortSignal.any when available). */
function abortSignalAny(signals: AbortSignal[]): AbortSignal {
  const any = AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal };
  if (typeof any.any === "function") {
    return any.any(signals);
  }
  const merged = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      merged.abort(s.reason);
      return merged.signal;
    }
    s.addEventListener("abort", () => merged.abort(s.reason), { once: true });
  }
  return merged.signal;
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init?: FetchWithTimeoutInit,
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _omit, signal: callerSignal, ...rest } = init ?? {};

  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(TIMEOUT_REASON);
  }, timeoutMs);

  const mergedSignal = abortSignalAny(
    callerSignal ? [timeoutController.signal, callerSignal] : [timeoutController.signal],
  );

  try {
    return await fetch(input, { ...rest, signal: mergedSignal });
  } catch (e) {
    if (callerSignal?.aborted) {
      throw callerSignal.reason !== undefined ? callerSignal.reason : e;
    }
    if (timeoutController.signal.aborted) {
      throw new FetchTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
