import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchThreadMessagesForInbox, inboxThreadMessagesQueryKey } from "./useThreadMessagesForInbox";

const HOVER_PREFETCH_MS = 200;

/**
 * Debounced hover prefetch + immediate prefetch for select/focus. Relies on global query `staleTime`
 * so repeated hovers do not spam the network when data is still fresh.
 */
export function useInboxThreadMessagesPrefetch() {
  const queryClient = useQueryClient();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetchThreadMessages = useCallback(
    (threadId: string) => {
      return queryClient.prefetchQuery({
        queryKey: inboxThreadMessagesQueryKey(threadId),
        queryFn: () => fetchThreadMessagesForInbox(threadId),
      });
    },
    [queryClient],
  );

  const scheduleHoverPrefetch = useCallback(
    (threadId: string) => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
      }
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        void prefetchThreadMessages(threadId);
      }, HOVER_PREFETCH_MS);
    },
    [prefetchThreadMessages],
  );

  const cancelHoverPrefetch = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  return { prefetchThreadMessages, scheduleHoverPrefetch, cancelHoverPrefetch };
}
