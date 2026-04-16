import { queryClient } from "./queryClient";
import type { DataChangeScope } from "./events";

/**
 * Partial query keys (prefix match) for TanStack Query invalidation.
 * Must stay aligned with Slice 2 helpers: `inboxLatestProjectionQueryKey`, `inboxActiveWeddingsQueryKey`,
 * `inboxThreadMessagesQueryKey`, `weddingsByPhotographerQueryKey`.
 */
export const queryKeyPrefixes = {
  inboxLatestProjection: ["inbox", "latest-projection"] as const,
  inboxActiveWeddings: ["inbox", "active-weddings"] as const,
  inboxThreadMessages: ["inbox", "thread-messages"] as const,
  weddingsByPhotographer: ["weddings", "by-photographer"] as const,
};

async function invalidateInboxQueryFamily(): Promise<void> {
  const qc = queryClient;
  await Promise.all([
    qc.invalidateQueries({ queryKey: [...queryKeyPrefixes.inboxLatestProjection] }),
    qc.invalidateQueries({ queryKey: [...queryKeyPrefixes.inboxActiveWeddings] }),
    qc.invalidateQueries({ queryKey: [...queryKeyPrefixes.inboxThreadMessages] }),
  ]);
}

async function invalidateWeddingsQueryFamily(): Promise<void> {
  const qc = queryClient;
  await Promise.all([
    qc.invalidateQueries({ queryKey: [...queryKeyPrefixes.weddingsByPhotographer] }),
    qc.invalidateQueries({ queryKey: [...queryKeyPrefixes.inboxActiveWeddings] }),
  ]);
}

/**
 * Maps `fireDataChanged` scopes to query cache invalidation. Scopes without query-backed hooks yet are no-ops here;
 * `fireDataChanged` still dispatches window events for legacy `onDataChanged` subscribers.
 */
export async function invalidateQueriesForDataChange(scope: DataChangeScope): Promise<void> {
  switch (scope) {
    case "all":
      await Promise.all([invalidateInboxQueryFamily(), invalidateWeddingsQueryFamily()]);
      break;
    case "inbox":
      await invalidateInboxQueryFamily();
      break;
    case "weddings":
      await invalidateWeddingsQueryFamily();
      break;
    case "drafts":
    case "tasks":
    case "escalations":
    case "metrics":
    case "settings":
      break;
    default:
      break;
  }
}
