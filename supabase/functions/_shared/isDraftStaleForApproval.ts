/**
 * execute_v3 Step 7C / Phase 12 Step 12C — stale draft gate for approval.
 *
 * If the thread received a newer inbound message after the draft was created,
 * approving that draft would send copy that ignores the latest client context.
 * Shared so `api-resolve-draft` and replay tests use one definition.
 */
export function isDraftStaleForApproval(
  lastInboundAt: string | null,
  draftCreatedAt: string,
): boolean {
  if (lastInboundAt == null || lastInboundAt === "") {
    return false;
  }
  return Date.parse(lastInboundAt) > Date.parse(draftCreatedAt);
}
