import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { INBOX_SEARCH_QUERY_PARAM } from "../lib/inboxUrlInboxParams";

const DEBOUNCE_MS = 280;

/**
 * Single sidebar inbox search: local typing + debounced writes to `?q=` (preserves other params).
 */
export function useInboxSearchInput() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qFromUrl = searchParams.get(INBOX_SEARCH_QUERY_PARAM) ?? "";
  const [draft, setDraft] = useState(qFromUrl);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(qFromUrl);
  }, [qFromUrl]);

  const flushDebouncedToUrl = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const t = draft.trim();
        if (t) next.set(INBOX_SEARCH_QUERY_PARAM, t);
        else next.delete(INBOX_SEARCH_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [draft, setSearchParams]);

  const setDraftDebouncedToUrl = useCallback(
    (value: string) => {
      setDraft(value);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            const t = value.trim();
            if (t) next.set(INBOX_SEARCH_QUERY_PARAM, t);
            else next.delete(INBOX_SEARCH_QUERY_PARAM);
            return next;
          },
          { replace: true },
        );
      }, DEBOUNCE_MS);
    },
    [setSearchParams],
  );

  const clearSearch = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setDraft("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(INBOX_SEARCH_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(
    () => () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    },
    [],
  );

  const urlHasActiveSearch = qFromUrl.trim().length > 0;

  return {
    inputValue: draft,
    setInputValue: setDraftDebouncedToUrl,
    clearSearch,
    onSearchBlur: flushDebouncedToUrl,
    urlHasActiveSearch,
  };
}
