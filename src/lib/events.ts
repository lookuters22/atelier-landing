import { invalidateQueriesForDataChange } from "./queryInvalidationBridge";

const DATA_CHANGED = "atelier:data-changed";

/**
 * Scoped invalidation: one mutation should not always refetch every dashboard hook.
 * `all` preserves legacy full-fanout behavior.
 */
export type DataChangeScope =
  | "all"
  | "tasks"
  | "drafts"
  | "inbox"
  | "weddings"
  | "metrics"
  | "escalations"
  | "settings";

type DataChangedDetail = { scope: DataChangeScope };

/**
 * Fire a single scope. For multi-entity updates, call multiple times (e.g. inbox + weddings).
 * Invalidates TanStack Query caches for known scopes (see `queryInvalidationBridge.ts`), then notifies legacy subscribers.
 */
export function fireDataChanged(scope: DataChangeScope = "all") {
  void invalidateQueriesForDataChange(scope);
  window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: { scope } satisfies DataChangedDetail }));
}

/**
 * Subscribe to refetches. Without `scopes`, only `all` events run the callback (safe default).
 * With `scopes`, the callback runs when the event scope is `all` or matches any listed scope.
 */
export function onDataChanged(
  callback: () => void,
  options?: { scopes?: DataChangeScope[] },
): () => void {
  const want = options?.scopes;
  const handler = (e: Event) => {
    const d = (e as CustomEvent<DataChangedDetail>).detail;
    const scope = d?.scope ?? "all";
    if (!want || want.length === 0) {
      if (scope === "all") callback();
      return;
    }
    if (scope === "all" || want.includes(scope)) {
      callback();
    }
  };
  window.addEventListener(DATA_CHANGED, handler as EventListener);
  return () => window.removeEventListener(DATA_CHANGED, handler as EventListener);
}

/** @deprecated Prefer `fireDataChanged("drafts")` — kept for a few call sites. */
export function fireDraftsChanged() {
  fireDataChanged("drafts");
}

/** @deprecated Use `onDataChanged` with scopes. */
export const onDraftsChanged = onDataChanged;
