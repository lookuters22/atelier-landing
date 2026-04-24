/**
 * Compatibility entrypoint for pre–post-ingest callers (e.g. `triage.ts`).
 * Canonical Gmail/thread dispatch lives in {@link postIngestThreadDispatch.ts}.
 */
import type { MainPathEmailDispatchResult } from "./postIngestThreadDispatch.ts";
import { orchestratorInboundSenderFields, runPostIngestThreadDispatch } from "./postIngestThreadDispatch.ts";

export type { MainPathEmailDispatchResult };
export { orchestratorInboundSenderFields };

export async function runMainPathEmailDispatch(
  input: Parameters<typeof runPostIngestThreadDispatch>[0],
): Promise<MainPathEmailDispatchResult> {
  return runPostIngestThreadDispatch(input);
}
