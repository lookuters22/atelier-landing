/* Data-loading hook: intentional batched state updates from async edges (matches Settings). */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import type { Database } from "../types/database.types";
import type { GmailLabelOption } from "../types/gmailImport.types";
import { parseGmailLabelsFromJson, sortGmailLabelsForDisplay } from "../lib/gmailLabels";
import { supabase } from "../lib/supabase";

type GoogleConnectedAccountRow = Pick<
  Database["public"]["Tables"]["connected_accounts"]["Row"],
  "id" | "email" | "sync_status" | "sync_error_summary"
>;

export type GoogleAccountForInboxLabels = Pick<
  GoogleConnectedAccountRow,
  "id" | "sync_status" | "sync_error_summary"
> | null;

function humanizeGmailLabelsInvokeError(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Labels unavailable right now.";
  if (/non-2xx|Edge Function returned/i.test(t)) {
    return "Labels unavailable right now. Cached labels below may be outdated — retry or open Settings.";
  }
  if (t.length > 160) return `${t.slice(0, 157)}…`;
  return t;
}

export function useGoogleConnectedAccount(photographerId: string | null) {
  const [account, setAccount] = useState<GoogleConnectedAccountRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!photographerId) {
      setAccount(null);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("id, email, sync_status, sync_error_summary")
      .eq("photographer_id", photographerId)
      .eq("provider", "google")
      .maybeSingle();
    if (error) {
      console.warn("[Inbox] connected_accounts (google)", error.message);
      setAccount(null);
    } else {
      setAccount(data ?? null);
    }
    setLoading(false);
  }, [photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { googleAccount: account, googleAccountLoading: loading, reloadGoogleAccount: load };
}

/**
 * Stale-while-revalidate Gmail labels for Inbox sidebar — mirrors Settings `gmail-list-labels` + DB cache pattern.
 * Labels refresh is queued via Inngest from the edge function; see `supabase/functions/gmail-list-labels/index.ts`.
 */
export function useInboxGmailLabels(photographerId: string | null, googleAccount: GoogleAccountForInboxLabels) {
  const connectedAccountId = googleAccount?.id ?? null;

  const [labels, setLabels] = useState<GmailLabelOption[]>([]);
  const [loading, setLoading] = useState(false);
  /** User-facing refresh failure; never raw generic Edge Function strings. */
  const [friendlyRefreshError, setFriendlyRefreshError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [refreshInProgress, setRefreshInProgress] = useState(false);
  /** First cache read failed (not background poll — those use silent mode). */
  const [gmailLabelsCacheReadError, setGmailLabelsCacheReadError] = useState<string | null>(null);

  const googleNeedsReconnect = Boolean(
    googleAccount &&
      (googleAccount.sync_status === "error" || googleAccount.sync_status === "disconnected"),
  );

  const loadGmailLabelCacheFromDb = useCallback(
    async (accountId: string, opts?: { silent?: boolean }) => {
      if (!photographerId) return;
      const { data, error } = await supabase
        .from("connected_account_gmail_label_cache")
        .select("labels_json, refreshed_at, last_error, refresh_in_progress")
        .eq("connected_account_id", accountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();
      if (error) {
        console.warn("[Inbox] gmail label cache read", error.message);
        if (!opts?.silent) {
          setGmailLabelsCacheReadError("Could not read your label cache from the database.");
        }
        return;
      }
      setGmailLabelsCacheReadError(null);
      if (!data) {
        setLabels([]);
        setRefreshedAt(null);
        setCacheError(null);
        setRefreshInProgress(false);
        return;
      }
      setLabels(sortGmailLabelsForDisplay(parseGmailLabelsFromJson(data.labels_json)));
      setRefreshedAt(data.refreshed_at);
      setCacheError(data.last_error);
      setRefreshInProgress(Boolean(data.refresh_in_progress));
    },
    [photographerId],
  );

  const runInvoke = useCallback(
    async (accountId: string, force: boolean) => {
      setLoading(true);
      setFriendlyRefreshError(null);
      const { data, error: fnErr } = await supabase.functions.invoke("gmail-list-labels", {
        body: { connected_account_id: accountId, force },
      });
      setLoading(false);
      if (fnErr) {
        setFriendlyRefreshError(humanizeGmailLabelsInvokeError(fnErr.message));
        await loadGmailLabelCacheFromDb(accountId, { silent: true });
        return;
      }
      const payload = data as Record<string, unknown> | null;
      const errMsg = payload && typeof payload.error === "string" ? payload.error : null;
      if (errMsg) {
        const detail = payload && typeof payload.detail === "string" ? payload.detail : null;
        setFriendlyRefreshError(
          humanizeGmailLabelsInvokeError(detail ? `${errMsg}: ${detail}` : errMsg),
        );
        await loadGmailLabelCacheFromDb(accountId, { silent: true });
        return;
      }
      const raw = payload && "labels" in payload ? payload.labels : null;
      const list = sortGmailLabelsForDisplay(parseGmailLabelsFromJson(raw));
      setLabels(list);
      const cache = payload?.cache as
        | { refreshed_at?: string | null; last_error?: string | null; refresh_in_progress?: boolean }
        | undefined;
      setRefreshedAt(cache?.refreshed_at ?? null);
      setCacheError(cache?.last_error ?? null);
      setRefreshInProgress(Boolean(cache?.refresh_in_progress));
    },
    [loadGmailLabelCacheFromDb],
  );

  useEffect(() => {
    if (!photographerId || !connectedAccountId) {
      setLabels([]);
      setRefreshedAt(null);
      setCacheError(null);
      setRefreshInProgress(false);
      setFriendlyRefreshError(null);
      setGmailLabelsCacheReadError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLabels([]);
      setRefreshedAt(null);
      setCacheError(null);
      setRefreshInProgress(false);
      setFriendlyRefreshError(null);
      setGmailLabelsCacheReadError(null);

      await loadGmailLabelCacheFromDb(connectedAccountId, { silent: false });
      if (cancelled) return;
      await runInvoke(connectedAccountId, false);
      if (cancelled) return;
      if (import.meta.env.DEV) {
        console.debug("[Inbox Gmail labels] fetch sequence complete", { connectedAccountId });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photographerId, connectedAccountId, loadGmailLabelCacheFromDb, runInvoke]);

  useEffect(() => {
    if (!photographerId || !connectedAccountId || !refreshInProgress) return;
    const t = window.setInterval(() => {
      void loadGmailLabelCacheFromDb(connectedAccountId, { silent: true });
    }, 4000);
    return () => window.clearInterval(t);
  }, [photographerId, connectedAccountId, refreshInProgress, loadGmailLabelCacheFromDb]);

  const retryGmailLabels = useCallback(() => {
    if (!connectedAccountId) return;
    void runInvoke(connectedAccountId, true);
  }, [connectedAccountId, runInvoke]);

  return {
    gmailLabels: labels,
    gmailLabelsLoading: loading,
    /** Calm copy for sidebar; not raw Edge errors. */
    gmailLabelsFriendlyError: friendlyRefreshError,
    gmailLabelsRefreshedAt: refreshedAt,
    gmailLabelsCacheError: cacheError,
    gmailLabelCacheRefreshing: refreshInProgress,
    gmailLabelsCacheReadError,
    googleNeedsReconnect,
    refreshGmailLabels: retryGmailLabels,
  };
}
