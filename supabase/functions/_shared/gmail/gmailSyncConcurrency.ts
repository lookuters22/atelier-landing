/**
 * G1: Bounded concurrency for Gmail sync workers (avoids sequential N round-trips while staying rate-limit safe).
 */

/** Max concurrent `threads.get` metadata calls per label sync (bounded; not unbounded parallelism). */
export const GMAIL_THREAD_METADATA_CONCURRENCY = 6;

/**
 * When `users.threads.list` returns a non-empty snippet, staging can skip `threads.get` for that thread:
 * subject stays null and message_count is a lower bound (≥1); G2+ prepare still loads full thread for approval.
 *
 * Gmail `users.threads.list` returns Thread resources with `id`, optional `snippet`, optional `historyId`
 * (see Gmail API `users.threads` resource). We treat any non-empty trimmed snippet as sufficient for
 * fast-lane staging so we avoid an extra `threads.get?format=metadata` round-trip.
 *
 * TODO: For large labels, consider Gmail **batch** HTTP (`POST https://www.googleapis.com/batch/gmail/v1`)
 * to bundle multiple `threads.get` calls where snippet is empty and metadata is still required — API quota
 * and multipart boundaries need a dedicated pass (Slice C defers full batch redesign).
 *
 * `historyId` may appear without a useful `snippet` (e.g. very new threads). The list response still does not
 * include subject or reliable message_count; we do **not** skip `threads.get` based on `historyId` alone.
 */
export function shouldSkipThreadMetadataFetch(tr: { snippet?: string; historyId?: string }): boolean {
  return typeof tr.snippet === "string" && tr.snippet.replace(/\s+/g, " ").trim().length > 0;
}

/**
 * Run async work over `items` with at most `concurrency` in-flight tasks (pool / work-queue).
 */
export async function runPoolWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
