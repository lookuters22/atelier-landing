import { QueryClient } from "@tanstack/react-query";

/**
 * Global TanStack Query defaults for Supabase-backed dashboard reads (Slice 1 foundation).
 *
 * - staleTime 60s: treated fresh briefly to cut redundant refetches on navigation.
 * - gcTime 10m: keep unused cache when hopping Inbox / thread / project views.
 * - refetchOnWindowFocus false: inbox flow also uses Supabase + event-driven refresh;
 *   focus refetch stacks on that and can feel noisy once hooks migrate to queries.
 * - refetchOnReconnect true: recover after connectivity blips.
 * - retry 2: one retry on transient failures (vs library default 3).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
    },
  },
});
