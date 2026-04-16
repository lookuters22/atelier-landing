/**
 * Gmail-style long-thread partitioning: first + tail + collapsible middle.
 */

export type ThreadOmissionPartition<T> =
  | { mode: "flat"; items: T[] }
  | { mode: "omission"; head: T; middle: T[]; tail: T[] };

/** Minimum total messages before we show an omission bar (first + N more + last 2). */
export const THREAD_OMISSION_THRESHOLD = 8;

/** Messages to keep visible at the end (newest) when using omission layout. */
export const THREAD_OMISSION_TAIL_SIZE = 2;

export function partitionThreadForOmission<T>(
  items: T[],
  threshold: number = THREAD_OMISSION_THRESHOLD,
): ThreadOmissionPartition<T> {
  const n = items.length;
  const tailSize = THREAD_OMISSION_TAIL_SIZE;
  if (n < threshold) {
    return { mode: "flat", items };
  }
  if (n <= tailSize + 1) {
    return { mode: "flat", items };
  }
  const head = items[0];
  const tail = items.slice(-tailSize);
  const middle = items.slice(1, -tailSize);
  if (middle.length === 0) {
    return { mode: "flat", items };
  }
  return { mode: "omission", head, middle, tail };
}
