import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Check, FlaskConical, Mail, MessageCircle, Phone, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readPhotographerSettings,
  writePhotographerSettingsMerged,
} from "@/lib/photographerSettings";
import { fireDataChanged, onDataChanged } from "@/lib/events";
import { maskGoogleOAuthClientId } from "@/lib/oauthDebug";
import { parseGmailLabelsFromJson, sortGmailLabelsForDisplay } from "@/lib/gmailLabels";
import type { Database } from "@/types/database.types";
import type { GmailImportTriggerStatus, GmailLabelOption } from "@/types/gmailImport.types";
import { GMAIL_GROUP_APPROVE_MAX_ROWS_PER_RUN } from "@/lib/gmailGroupImportLimits";
import { scrollPipelineWeddingRowIntoView } from "@/lib/pipelineWeddingListNavigation";
import { isEditableKeyboardTarget } from "@/lib/timelineThreadNavigation";
import { GmailRepairOpsPanel } from "./GmailRepairOpsPanel";
import { StudioBriefingEntryCard } from "@/components/settings/StudioBriefingEntryCard";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

type GoogleConnectedAccountRow = Pick<
  Database["public"]["Tables"]["connected_accounts"]["Row"],
  "id" | "email" | "sync_status" | "sync_error_summary"
>;

/** Columns for the review table; `materialized_thread_id` optional when DB has not applied materialization migration yet. */
type ImportCandidateListRow = Pick<
  Database["public"]["Tables"]["import_candidates"]["Row"],
  | "id"
  | "subject"
  | "snippet"
  | "source_label_name"
  | "message_count"
  | "status"
  | "created_at"
  | "gmail_label_import_group_id"
> & { materialized_thread_id?: string | null; import_approval_error?: string | null };

type GmailLabelGroupRow = Database["public"]["Tables"]["gmail_label_import_groups"]["Row"];

function formatGmailSyncLabel(syncStatus: string): string {
  switch (syncStatus) {
    case "connected":
      return "Connected";
    case "syncing":
      return "Syncing…";
    case "error":
      return "Error";
    case "disconnected":
      return "Disconnected";
    default:
      return syncStatus;
  }
}

function formatGmailLabelsRefreshedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

/** DB text may include stray whitespace; strict `=== "pending"` hid actions or mis-styled rows. */
function normalizeImportCandidateStatus(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export type SettingsHubPageProps = {
  /** When false, hides the cross-link to the manager shell (used from `/manager/settings`). */
  showManagerPreviewLink?: boolean;
};

const COUNTRY_CODES = [
  { code: "+355", flag: "\u{1F1E6}\u{1F1F1}", label: "Albania" },
  { code: "+376", flag: "\u{1F1E6}\u{1F1E9}", label: "Andorra" },
  { code: "+54", flag: "\u{1F1E6}\u{1F1F7}", label: "Argentina" },
  { code: "+43", flag: "\u{1F1E6}\u{1F1F9}", label: "Austria" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", label: "Australia" },
  { code: "+32", flag: "\u{1F1E7}\u{1F1EA}", label: "Belgium" },
  { code: "+387", flag: "\u{1F1E7}\u{1F1E6}", label: "Bosnia" },
  { code: "+55", flag: "\u{1F1E7}\u{1F1F7}", label: "Brazil" },
  { code: "+359", flag: "\u{1F1E7}\u{1F1EC}", label: "Bulgaria" },
  { code: "+1", flag: "\u{1F1E8}\u{1F1E6}", label: "Canada" },
  { code: "+56", flag: "\u{1F1E8}\u{1F1F1}", label: "Chile" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", label: "China" },
  { code: "+57", flag: "\u{1F1E8}\u{1F1F4}", label: "Colombia" },
  { code: "+385", flag: "\u{1F1ED}\u{1F1F7}", label: "Croatia" },
  { code: "+357", flag: "\u{1F1E8}\u{1F1FE}", label: "Cyprus" },
  { code: "+420", flag: "\u{1F1E8}\u{1F1FF}", label: "Czechia" },
  { code: "+45", flag: "\u{1F1E9}\u{1F1F0}", label: "Denmark" },
  { code: "+20", flag: "\u{1F1EA}\u{1F1EC}", label: "Egypt" },
  { code: "+372", flag: "\u{1F1EA}\u{1F1EA}", label: "Estonia" },
  { code: "+358", flag: "\u{1F1EB}\u{1F1EE}", label: "Finland" },
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", label: "France" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", label: "Germany" },
  { code: "+30", flag: "\u{1F1EC}\u{1F1F7}", label: "Greece" },
  { code: "+852", flag: "\u{1F1ED}\u{1F1F0}", label: "Hong Kong" },
  { code: "+36", flag: "\u{1F1ED}\u{1F1FA}", label: "Hungary" },
  { code: "+354", flag: "\u{1F1EE}\u{1F1F8}", label: "Iceland" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", label: "India" },
  { code: "+62", flag: "\u{1F1EE}\u{1F1E9}", label: "Indonesia" },
  { code: "+353", flag: "\u{1F1EE}\u{1F1EA}", label: "Ireland" },
  { code: "+972", flag: "\u{1F1EE}\u{1F1F1}", label: "Israel" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", label: "Italy" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", label: "Japan" },
  { code: "+82", flag: "\u{1F1F0}\u{1F1F7}", label: "South Korea" },
  { code: "+383", flag: "\u{1F1FD}\u{1F1F0}", label: "Kosovo" },
  { code: "+371", flag: "\u{1F1F1}\u{1F1FB}", label: "Latvia" },
  { code: "+370", flag: "\u{1F1F1}\u{1F1F9}", label: "Lithuania" },
  { code: "+352", flag: "\u{1F1F1}\u{1F1FA}", label: "Luxembourg" },
  { code: "+60", flag: "\u{1F1F2}\u{1F1FE}", label: "Malaysia" },
  { code: "+356", flag: "\u{1F1F2}\u{1F1F9}", label: "Malta" },
  { code: "+52", flag: "\u{1F1F2}\u{1F1FD}", label: "Mexico" },
  { code: "+377", flag: "\u{1F1F2}\u{1F1E8}", label: "Monaco" },
  { code: "+382", flag: "\u{1F1F2}\u{1F1EA}", label: "Montenegro" },
  { code: "+212", flag: "\u{1F1F2}\u{1F1E6}", label: "Morocco" },
  { code: "+31", flag: "\u{1F1F3}\u{1F1F1}", label: "Netherlands" },
  { code: "+64", flag: "\u{1F1F3}\u{1F1FF}", label: "New Zealand" },
  { code: "+234", flag: "\u{1F1F3}\u{1F1EC}", label: "Nigeria" },
  { code: "+389", flag: "\u{1F1F2}\u{1F1F0}", label: "N. Macedonia" },
  { code: "+47", flag: "\u{1F1F3}\u{1F1F4}", label: "Norway" },
  { code: "+63", flag: "\u{1F1F5}\u{1F1ED}", label: "Philippines" },
  { code: "+48", flag: "\u{1F1F5}\u{1F1F1}", label: "Poland" },
  { code: "+351", flag: "\u{1F1F5}\u{1F1F9}", label: "Portugal" },
  { code: "+40", flag: "\u{1F1F7}\u{1F1F4}", label: "Romania" },
  { code: "+966", flag: "\u{1F1F8}\u{1F1E6}", label: "Saudi Arabia" },
  { code: "+381", flag: "\u{1F1F7}\u{1F1F8}", label: "Serbia" },
  { code: "+65", flag: "\u{1F1F8}\u{1F1EC}", label: "Singapore" },
  { code: "+421", flag: "\u{1F1F8}\u{1F1F0}", label: "Slovakia" },
  { code: "+386", flag: "\u{1F1F8}\u{1F1EE}", label: "Slovenia" },
  { code: "+27", flag: "\u{1F1FF}\u{1F1E6}", label: "South Africa" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", label: "Spain" },
  { code: "+46", flag: "\u{1F1F8}\u{1F1EA}", label: "Sweden" },
  { code: "+41", flag: "\u{1F1E8}\u{1F1ED}", label: "Switzerland" },
  { code: "+66", flag: "\u{1F1F9}\u{1F1ED}", label: "Thailand" },
  { code: "+90", flag: "\u{1F1F9}\u{1F1F7}", label: "Turkey" },
  { code: "+380", flag: "\u{1F1FA}\u{1F1E6}", label: "Ukraine" },
  { code: "+971", flag: "\u{1F1E6}\u{1F1EA}", label: "UAE" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", label: "United Kingdom" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", label: "United States" },
  { code: "+598", flag: "\u{1F1FA}\u{1F1FE}", label: "Uruguay" },
  { code: "+84", flag: "\u{1F1FB}\u{1F1F3}", label: "Vietnam" },
];

export function SettingsHubPage({ showManagerPreviewLink = true }: SettingsHubPageProps) {
  const { photographerId } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [countryCode, setCountryCode] = useState("+381");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [studioName, setStudioName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [photographerNames, setPhotographerNames] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [adminMobileNumber, setAdminMobileNumber] = useState("");
  const [playbookVersion, setPlaybookVersion] = useState("");
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [opSaving, setOpSaving] = useState(false);
  const [opSaved, setOpSaved] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  /** Phase 11.5 Step 11.5C — one dashboard readout (open escalations; not the full observability surface). */
  const [openEscalationsCount, setOpenEscalationsCount] = useState<number | null>(null);
  const [observabilityLoading, setObservabilityLoading] = useState(false);
  const [observabilityError, setObservabilityError] = useState<string | null>(null);

  /** Gmail OAuth (fast-lane import foundation): connect via Edge `auth-google-init` — staged imports belong in Inbox after a future approve flow, not a separate inbox tab. */
  const [gmailConnectLoading, setGmailConnectLoading] = useState(false);
  const [gmailConnectError, setGmailConnectError] = useState<string | null>(null);
  const [googleAccount, setGoogleAccount] = useState<GoogleConnectedAccountRow | null>(null);
  const [gmailAccountLoading, setGmailAccountLoading] = useState(false);
  const [gmailOAuthFlash, setGmailOAuthFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /** Gmail label import (staged `import_candidates` only — not Inbox until a later approve flow). */
  const [gmailLabels, setGmailLabels] = useState<GmailLabelOption[]>([]);
  const [gmailLabelsLoading, setGmailLabelsLoading] = useState(false);
  const [gmailLabelsError, setGmailLabelsError] = useState<string | null>(null);
  /** Background refresh failure (from `connected_account_gmail_label_cache.last_error`). */
  const [gmailLabelsRefreshError, setGmailLabelsRefreshError] = useState<string | null>(null);
  const [gmailLabelsRefreshedAt, setGmailLabelsRefreshedAt] = useState<string | null>(null);
  const [gmailLabelCacheRefreshing, setGmailLabelCacheRefreshing] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [importTriggerStatus, setImportTriggerStatus] = useState<GmailImportTriggerStatus>("idle");
  const [importTriggerDetail, setImportTriggerDetail] = useState<string | null>(null);
  const [stagedImportCount, setStagedImportCount] = useState<number | null>(null);
  const [stagedCountLoading, setStagedCountLoading] = useState(false);
  /** Bumps when returning from OAuth so labels/staged count reload even if `connected_accounts.id` is unchanged. */
  const [gmailIntegrationRefresh, setGmailIntegrationRefresh] = useState(0);
  const [importCandidates, setImportCandidates] = useState<ImportCandidateListRow[]>([]);
  const [importCandidatesLoading, setImportCandidatesLoading] = useState(false);
  /** Set when the list SELECT fails (e.g. unknown column) — avoids silent empty list while count succeeds. */
  const [importCandidatesListError, setImportCandidatesListError] = useState<string | null>(null);
  /** G5 async: keyed by `gmail_label_import_groups.id` for batch progress. */
  const [gmailLabelGroups, setGmailLabelGroups] = useState<Record<string, GmailLabelGroupRow>>({});
  const [importReviewBusyId, setImportReviewBusyId] = useState<string | null>(null);
  /** Shown when `import-candidate-review` invoke fails (distinct from a greyed-out primary button). */
  const [importReviewError, setImportReviewError] = useState<string | null>(null);
  /** G5: last grouped approve navigates to Pipeline project. */
  const [groupApproveNotice, setGroupApproveNotice] = useState<{ weddingId: string; label: string } | null>(null);
  /** After label sync enqueue, poll staging + sync status more often so worker errors surface without a full reload. */
  const [gmailPostImportWatchAccountId, setGmailPostImportWatchAccountId] = useState<string | null>(null);

  const loadGoogleAccount = useCallback(async (opts?: { silent?: boolean }) => {
    if (!photographerId) {
      setGoogleAccount(null);
      return;
    }
    if (!opts?.silent) setGmailAccountLoading(true);
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("id, email, sync_status, sync_error_summary")
      .eq("photographer_id", photographerId)
      .eq("provider", "google")
      .maybeSingle();
    if (error) {
      console.warn("[Settings] connected_accounts (google)", error.message);
      setGoogleAccount(null);
    } else {
      setGoogleAccount(data ?? null);
    }
    if (!opts?.silent) setGmailAccountLoading(false);
  }, [photographerId]);

  const loadStagedImportCount = useCallback(async (connectedAccountId: string, opts?: { silent?: boolean }) => {
    if (!photographerId) return;
    if (!opts?.silent) setStagedCountLoading(true);
    const { count, error } = await supabase
      .from("import_candidates")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("connected_account_id", connectedAccountId);
    if (error) {
      console.warn("[Settings] import_candidates count", error.message);
      setStagedImportCount(null);
    } else {
      setStagedImportCount(count ?? 0);
    }
    if (!opts?.silent) setStagedCountLoading(false);
  }, [photographerId]);

  const loadImportCandidates = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!photographerId) {
        setImportCandidates([]);
        setImportCandidatesListError(null);
        return;
      }
      if (!opts?.silent) setImportCandidatesLoading(true);
      /**
       * Must match `loadStagedImportCount` scope when a Google account is loaded:
       * `photographer_id` + `connected_account_id`. Otherwise the count can update after sync while the list
       * never refetched (see effect deps) or shows a different row set.
       *
       * Use `select("*")` instead of listing `materialized_thread_id` explicitly: if hosted DB has not applied
       * `20260427120000_import_candidates_materialization.sql`, a column-specific SELECT fails while
       * `select("id", { count: "exact", head: true })` still succeeds — producing count=1 and list=[] with no error UI.
       */
      let q = supabase.from("import_candidates").select("*").eq("photographer_id", photographerId);
      if (googleAccount?.id) {
        q = q.eq("connected_account_id", googleAccount.id);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) {
        console.warn("[Settings] import_candidates list", error.code, error.message, error.details);
        setImportCandidates([]);
        setImportCandidatesListError(
          [error.message, error.details].filter(Boolean).join(" — ") || "Failed to load import candidates",
        );
      } else {
        setImportCandidatesListError(null);
        setImportCandidates((data ?? []) as ImportCandidateListRow[]);
      }
      if (!opts?.silent) setImportCandidatesLoading(false);
    },
    [photographerId, googleAccount?.id],
  );

  const loadGmailLabelGroups = useCallback(
    async (opts?: { silent?: boolean }) => {
      void opts?.silent;
      if (!photographerId) {
        setGmailLabelGroups({});
        return;
      }
      const { data, error } = await supabase
        .from("gmail_label_import_groups")
        .select("*")
        .eq("photographer_id", photographerId)
        .order("updated_at", { ascending: false })
        .limit(48);
      if (error) {
        console.warn("[Settings] gmail_label_import_groups", error.message);
        return;
      }
      const next: Record<string, GmailLabelGroupRow> = {};
      for (const r of data ?? []) {
        next[r.id] = r as GmailLabelGroupRow;
      }
      setGmailLabelGroups(next);
    },
    [photographerId],
  );

  const refetchGmailStaging = useCallback(() => {
    void loadImportCandidates();
    void loadGmailLabelGroups();
    if (googleAccount?.id) void loadStagedImportCount(googleAccount.id);
  }, [loadImportCandidates, loadGmailLabelGroups, loadStagedImportCount, googleAccount?.id]);

  const loadGmailLabelCacheFromDb = useCallback(
    async (connectedAccountId: string) => {
      if (!photographerId) return;
      const { data, error } = await supabase
        .from("connected_account_gmail_label_cache")
        .select("labels_json, refreshed_at, last_error, refresh_in_progress")
        .eq("connected_account_id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();
      if (error) {
        console.warn("[Settings] gmail label cache poll", error.message);
        return;
      }
      if (!data) return;
      setGmailLabels(parseGmailLabelsFromJson(data.labels_json));
      setGmailLabelsRefreshedAt(data.refreshed_at);
      setGmailLabelsRefreshError(data.last_error);
      setGmailLabelCacheRefreshing(Boolean(data.refresh_in_progress));
    },
    [photographerId],
  );

  const loadGmailLabels = useCallback(
    async (connectedAccountId: string, opts?: { force?: boolean }) => {
      setGmailLabelsLoading(true);
      setGmailLabelsError(null);
      const { data, error } = await supabase.functions.invoke("gmail-list-labels", {
        body: { connected_account_id: connectedAccountId, force: opts?.force === true },
      });
      setGmailLabelsLoading(false);
      if (error) {
        setGmailLabelsError(error.message);
        /** Stale-while-revalidate: keep last-known labels; sync meta from DB cache if Edge never returned. */
        void loadGmailLabelCacheFromDb(connectedAccountId);
        return;
      }
      const payload = data as Record<string, unknown> | null;
      const errMsg =
        payload && typeof payload.error === "string" ? payload.error : null;
      if (errMsg) {
        const detail =
          payload && typeof payload.detail === "string" ? payload.detail : null;
        setGmailLabelsError(detail ? `${errMsg}: ${detail}` : errMsg);
        /** Same as transport failure — do not clear labels; refresh meta from DB (e.g. enqueue_failed). */
        void loadGmailLabelCacheFromDb(connectedAccountId);
        return;
      }
      const raw = payload && "labels" in payload ? payload.labels : null;
      const list = parseGmailLabelsFromJson(raw);
      setGmailLabels(list);
      const cache = payload?.cache as
        | {
            refreshed_at?: string | null;
            last_error?: string | null;
            refresh_in_progress?: boolean;
          }
        | undefined;
      setGmailLabelsRefreshedAt(cache?.refreshed_at ?? null);
      setGmailLabelsRefreshError(cache?.last_error ?? null);
      setGmailLabelCacheRefreshing(Boolean(cache?.refresh_in_progress));
    },
    [loadGmailLabelCacheFromDb],
  );

  useEffect(() => {
    setSelectedLabelIds([]);
    setImportTriggerStatus("idle");
    setImportTriggerDetail(null);
    setGmailLabelsRefreshError(null);
    setGmailLabelsRefreshedAt(null);
    setGmailLabelCacheRefreshing(false);
  }, [googleAccount?.id]);

  /** Poll DB while Inngest refreshes Gmail labels (A3 cache). */
  useEffect(() => {
    if (!googleAccount?.id || !gmailLabelCacheRefreshing) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadGmailLabelCacheFromDb(googleAccount.id);
    }, 4000);
    return () => window.clearInterval(id);
  }, [googleAccount?.id, gmailLabelCacheRefreshing, loadGmailLabelCacheFromDb]);

  useEffect(() => {
    if (!googleAccount?.id) {
      setGmailLabels([]);
      setGmailLabelsError(null);
      setStagedImportCount(null);
      return;
    }
    void loadGmailLabels(googleAccount.id);
    void loadStagedImportCount(googleAccount.id);
  }, [googleAccount?.id, gmailIntegrationRefresh, loadGmailLabels, loadStagedImportCount]);

  useEffect(() => {
    if (!photographerId) return;
    void (async () => {
      const loaded = await readPhotographerSettings(supabase, photographerId);
      if (!loaded) return;
      const { contract, raw } = loaded;
      setStudioName(contract.studio_name ?? "");
      setManagerName(contract.manager_name ?? "");
      setPhotographerNames(contract.photographer_names ?? "");
      setTimezone(contract.timezone ?? "");
      setCurrency(contract.currency ?? "");
      setAdminMobileNumber(contract.admin_mobile_number ?? "");
      setPlaybookVersion(
        contract.playbook_version !== undefined ? String(contract.playbook_version) : "",
      );
      setOnboardingCompletedAt(contract.onboarding_completed_at ?? null);

      const saved = (raw.whatsapp_number as string) ?? "";
      if (saved) {
        const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
        const match = sorted.find((c) => saved.startsWith(c.code));
        if (match) {
          setCountryCode(match.code);
          setPhoneNumber(saved.slice(match.code.length));
        } else {
          setPhoneNumber(saved);
        }
      }
    })();
  }, [photographerId]);

  useEffect(() => {
    void loadGoogleAccount();
  }, [loadGoogleAccount]);

  useEffect(() => {
    void loadImportCandidates();
    void loadGmailLabelGroups();
  }, [photographerId, gmailIntegrationRefresh, googleAccount?.id, loadImportCandidates, loadGmailLabelGroups]);

  useEffect(() => {
    if (!photographerId) return;
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadImportCandidates();
      void loadGmailLabelGroups();
      if (googleAccount?.id) void loadStagedImportCount(googleAccount.id);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [photographerId, googleAccount?.id, loadImportCandidates, loadGmailLabelGroups, loadStagedImportCount]);

  /** When a batch or single-row approval is in flight, poll faster for progress. */
  useEffect(() => {
    if (!photographerId) return;
    const approving =
      Object.values(gmailLabelGroups).some((g) => g.status === "approving") ||
      importCandidates.some((c) => normalizeImportCandidateStatus(c.status) === "approving");
    if (!approving) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadImportCandidates({ silent: true });
      void loadGmailLabelGroups({ silent: true });
    }, 4000);
    return () => window.clearInterval(id);
  }, [photographerId, gmailLabelGroups, importCandidates, loadImportCandidates, loadGmailLabelGroups]);

  useEffect(() => {
    if (!gmailPostImportWatchAccountId || !photographerId) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      ticks += 1;
      void loadGoogleAccount({ silent: true });
      void loadImportCandidates({ silent: true });
      void loadGmailLabelGroups({ silent: true });
      void loadStagedImportCount(gmailPostImportWatchAccountId, { silent: true });
      if (ticks >= 30) {
        window.clearInterval(id);
        setGmailPostImportWatchAccountId(null);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [
    gmailPostImportWatchAccountId,
    photographerId,
    loadGoogleAccount,
    loadImportCandidates,
    loadGmailLabelGroups,
    loadStagedImportCount,
  ]);

  useEffect(
    () =>
      onDataChanged(refetchGmailStaging, {
        scopes: ["all", "inbox", "weddings", "drafts"],
      }),
    [refetchGmailStaging],
  );

  /** OAuth redirect: `auth-google-callback` appends `gmail=connected` or `gmail_error=…` to `GMAIL_OAUTH_APP_REDIRECT_URL`. */
  useEffect(() => {
    const gmail = searchParams.get("gmail");
    const gmailErr = searchParams.get("gmail_error");
    if (gmail !== "connected" && !gmailErr) return;

    if (gmail === "connected") {
      setGmailOAuthFlash({
        type: "success",
        message:
          "Gmail connected. Your account appears below. If you reconnected, Google may have asked for additional Gmail permissions — those allow star and read/unread sync in Inbox.",
      });
      setGmailIntegrationRefresh((n) => n + 1);
    } else if (gmailErr) {
      let decoded = gmailErr;
      try {
        decoded = decodeURIComponent(gmailErr.replace(/\+/g, " "));
      } catch {
        /* use raw */
      }
      setGmailOAuthFlash({
        type: "error",
        message: decoded,
      });
      setGmailIntegrationRefresh((n) => n + 1);
    }

    void loadGoogleAccount();

    const next = new URLSearchParams(searchParams);
    next.delete("gmail");
    next.delete("gmail_error");
    navigate(
      { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" },
      { replace: true },
    );
  }, [searchParams, location.pathname, navigate, loadGoogleAccount]);

  useEffect(() => {
    if (!gmailOAuthFlash) return;
    const t = window.setTimeout(() => setGmailOAuthFlash(null), 10_000);
    return () => window.clearTimeout(t);
  }, [gmailOAuthFlash]);

  useEffect(() => {
    if (!photographerId) return;
    let cancelled = false;
    void (async () => {
      setObservabilityLoading(true);
      setObservabilityError(null);
      const { count, error } = await supabase
        .from("escalation_requests")
        .select("*", { count: "exact", head: true })
        .eq("photographer_id", photographerId)
        .eq("status", "open");
      if (cancelled) return;
      if (error) {
        setObservabilityError(error.message);
        setOpenEscalationsCount(null);
      } else {
        setOpenEscalationsCount(count ?? 0);
      }
      setObservabilityLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photographerId]);

  async function saveProfileContract() {
    if (!photographerId) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      let playbookVersionParsed: string | number | undefined;
      const pb = playbookVersion.trim();
      if (pb === "") {
        playbookVersionParsed = undefined;
      } else if (/^\d+$/.test(pb)) {
        playbookVersionParsed = Number(pb);
      } else {
        playbookVersionParsed = pb;
      }

      await writePhotographerSettingsMerged(supabase, photographerId, {
        studio_name: studioName.trim() || undefined,
        manager_name: managerName.trim() || undefined,
        photographer_names: photographerNames.trim() || undefined,
        timezone: timezone.trim() || undefined,
        currency: currency.trim() || undefined,
        playbook_version: playbookVersionParsed,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveOperatorNumber() {
    if (!photographerId) return;
    setOpSaving(true);
    setOpError(null);
    setOpSaved(false);
    try {
      await writePhotographerSettingsMerged(supabase, photographerId, {
        admin_mobile_number: adminMobileNumber.trim() || undefined,
      });
      setOpSaved(true);
      setTimeout(() => setOpSaved(false), 3000);
    } catch (err: unknown) {
      setOpError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setOpSaving(false);
    }
  }

  async function saveWhatsAppNumber() {
    if (!photographerId) return;
    setWaSaving(true);
    setWaError(null);
    setWaSaved(false);

    const fullNumber = phoneNumber.trim() ? `${countryCode}${phoneNumber.trim().replace(/^0+/, "")}` : "";

    try {
      await writePhotographerSettingsMerged(supabase, photographerId, {
        whatsapp_number: fullNumber || undefined,
      });
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 3000);
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setWaSaving(false);
    }
  }

  async function connectGmail() {
    setGmailConnectLoading(true);
    setGmailConnectError(null);
    try {
      const { data, error } = await supabase.functions.invoke("auth-google-init", { body: {} });
      if (error) throw error;
      const url = data && typeof data === "object" && "url" in data ? (data as { url?: unknown }).url : undefined;
      if (typeof url !== "string" || !url.startsWith("http")) {
        throw new Error("No authorization URL returned");
      }
      if (import.meta.env.DEV) {
        try {
          const u = new URL(url);
          const cid = u.searchParams.get("client_id");
          const redir = u.searchParams.get("redirect_uri");
          console.debug(
            "[Gmail OAuth] Edge auth URL (dev) — Supabase:",
            import.meta.env.VITE_SUPABASE_URL,
            "| client_id:",
            maskGoogleOAuthClientId(cid),
            "| redirect_uri:",
            redir,
          );
        } catch {
          /* ignore parse errors */
        }
      }
      window.location.href = url;
    } catch (err: unknown) {
      setGmailConnectError(err instanceof Error ? err.message : "Failed to start Gmail connection");
    } finally {
      setGmailConnectLoading(false);
    }
  }

  function toggleGmailLabelSelection(labelId: string) {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((x) => x !== labelId) : [...prev, labelId],
    );
  }

  async function importGmailThreadsFromLabels() {
    if (!googleAccount?.id || selectedLabelIds.length === 0) return;
    const selected = sortGmailLabelsForDisplay(gmailLabels.filter((l) => selectedLabelIds.includes(l.id)));
    if (selected.length === 0) return;

    setImportTriggerStatus("enqueuing");
    setImportTriggerDetail(null);
    try {
      let lastInngestEventIds: string[] | undefined;
      for (const label of selected) {
        const { data, error } = await supabase.functions.invoke("gmail-enqueue-label-sync", {
          body: {
            connected_account_id: googleAccount.id,
            label_id: label.id,
            label_name: label.name,
          },
        });
        if (error) {
          setImportTriggerStatus("error");
          setImportTriggerDetail(error.message);
          return;
        }
        if (data && typeof data === "object" && "ids" in data) {
          const arr = (data as { ids?: unknown }).ids;
          if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
            lastInngestEventIds = arr as string[];
          }
        }
      }
      setImportTriggerStatus("success");
      setGmailPostImportWatchAccountId(googleAccount.id);
      setImportTriggerDetail(
        `Queued ${selected.length} label sync${selected.length === 1 ? "" : "s"}. Staged rows appear when the worker finishes (often under a minute).` +
          (lastInngestEventIds?.length
            ? ` Inngest event id(s): ${lastInngestEventIds.slice(0, 2).join(", ")}${lastInngestEventIds.length > 2 ? "…" : ""}.`
            : "") +
          ` If nothing appears, check Sync status below for errors.`,
      );
      await loadGoogleAccount();
      await loadStagedImportCount(googleAccount.id);
      await loadImportCandidates();
      fireDataChanged();
    } catch (err: unknown) {
      setImportTriggerStatus("error");
      setImportTriggerDetail(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function reviewImportCandidate(candidateId: string, action: "approve" | "dismiss") {
    setImportReviewBusyId(candidateId);
    setImportReviewError(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-candidate-review", {
        body: { import_candidate_id: candidateId, action },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }
      await loadImportCandidates();
      if (googleAccount?.id) await loadStagedImportCount(googleAccount.id);
      await loadGoogleAccount();
      fireDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Settings] import-candidate-review", err);
      setImportReviewError(msg);
    } finally {
      setImportReviewBusyId(null);
    }
  }

  /** G5: Approve or dismiss all pending threads staged for one Gmail label batch. */
  /** Re-queue remaining `pending` rows after partial / failed / truncated grouped approval. */
  async function retryLabelGroup(groupId: string, labelName: string) {
    setImportReviewBusyId(`group-retry:${groupId}`);
    setImportReviewError(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-candidate-review", {
        body: { gmail_label_import_group_id: groupId, action: "retry_group_failed" },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }
      const d = data as { weddingId?: string } | null;
      if (d?.weddingId) {
        setGroupApproveNotice({ weddingId: d.weddingId, label: labelName });
      }
      await loadImportCandidates();
      await loadGmailLabelGroups();
      if (googleAccount?.id) await loadStagedImportCount(googleAccount.id);
      await loadGoogleAccount();
      fireDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Settings] retry_group_failed", err);
      setImportReviewError(msg);
    } finally {
      setImportReviewBusyId(null);
    }
  }

  async function reviewLabelGroup(
    groupId: string,
    action: "approve_group" | "dismiss_group",
    labelName: string,
  ) {
    setImportReviewBusyId(`group:${groupId}`);
    setImportReviewError(null);
    setGroupApproveNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-candidate-review", {
        body: { gmail_label_import_group_id: groupId, action },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }
      const d = data as {
        action?: string;
        weddingId?: string;
        totalCandidates?: number;
        message?: string;
      } | null;
      if (action === "approve_group" && d?.weddingId) {
        setGroupApproveNotice({ weddingId: d.weddingId, label: labelName });
      }
      await loadImportCandidates();
      await loadGmailLabelGroups();
      if (googleAccount?.id) await loadStagedImportCount(googleAccount.id);
      await loadGoogleAccount();
      fireDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Settings] import-candidate-review group", err);
      setImportReviewError(msg);
    } finally {
      setImportReviewBusyId(null);
    }
  }

  const pendingLabelBatches = useMemo(() => {
    const map = new Map<string, ImportCandidateListRow[]>();
    for (const c of importCandidates) {
      if (!c.gmail_label_import_group_id) continue;
      if (normalizeImportCandidateStatus(c.status) !== "pending") continue;
      const gid = c.gmail_label_import_group_id;
      const arr = map.get(gid) ?? [];
      arr.push(c);
      map.set(gid, arr);
    }
    return Array.from(map.entries());
  }, [importCandidates]);

  /** Pending batches from rows + orphan `approving` groups (worker running, list may be empty briefly). */
  const labelBatchCards = useMemo(() => {
    const m = new Map<string, { rows: ImportCandidateListRow[]; groupMeta?: GmailLabelGroupRow }>();
    for (const [gid, rows] of pendingLabelBatches) {
      m.set(gid, { rows, groupMeta: gmailLabelGroups[gid] });
    }
    for (const g of Object.values(gmailLabelGroups)) {
      if (g.status === "approving" && !m.has(g.id)) {
        m.set(g.id, { rows: [], groupMeta: g });
      }
    }
    return Array.from(m.entries());
  }, [pendingLabelBatches, gmailLabelGroups]);

  /** Terminal partial/failed groups that still have pending candidates (retry or individual approve). */
  const recoveryGroupCards = useMemo(() => {
    return Object.values(gmailLabelGroups).filter((g) => {
      if (g.status !== "partially_approved" && g.status !== "failed") return false;
      if (!g.materialized_wedding_id) return false;
      const pendingN = importCandidates.filter(
        (c) =>
          c.gmail_label_import_group_id === g.id && normalizeImportCandidateStatus(c.status) === "pending",
      ).length;
      return pendingN > 0;
    });
  }, [gmailLabelGroups, importCandidates]);

  /** A7: roving keyboard over pending staged-import rows only (↑/↓/j/k unmodified; Enter/Space native Approve). */
  const stagedPendingImportRows = useMemo(
    () => importCandidates.filter((c) => normalizeImportCandidateStatus(c.status) === "pending"),
    [importCandidates],
  );

  const stagedPendingIndexByCandidateId = useMemo(() => {
    const m = new Map<string, number>();
    stagedPendingImportRows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [stagedPendingImportRows]);

  const [importCandidateRovingIndex, setImportCandidateRovingIndex] = useState<number | null>(null);
  const stagedImportCandidatesListRef = useRef<HTMLDivElement>(null);
  const stagedImportApproveButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (stagedPendingImportRows.length === 0) {
      setImportCandidateRovingIndex(null);
      return;
    }
    setImportCandidateRovingIndex((prev) => {
      if (prev === null) return null;
      return Math.min(prev, stagedPendingImportRows.length - 1);
    });
  }, [stagedPendingImportRows.length]);

  const handleStagedImportListKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent) => {
      if (stagedPendingImportRows.length === 0) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key;
      const keyLower = key.length === 1 ? key.toLowerCase() : key;
      const isDown = key === "ArrowDown" || keyLower === "j";
      const isUp = key === "ArrowUp" || keyLower === "k";

      if (key === "Escape") {
        if (importCandidateRovingIndex !== null) {
          e.preventDefault();
          setImportCandidateRovingIndex(null);
          requestAnimationFrame(() => stagedImportCandidatesListRef.current?.focus());
        }
        return;
      }

      if (!isDown && !isUp) return;

      e.preventDefault();
      if (isDown) {
        setImportCandidateRovingIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, stagedPendingImportRows.length - 1);
        });
      } else {
        setImportCandidateRovingIndex((prev) => {
          if (prev === null) return stagedPendingImportRows.length - 1;
          return Math.max(prev - 1, 0);
        });
      }
    },
    [stagedPendingImportRows.length, importCandidateRovingIndex],
  );

  const activeStagedImportRowId =
    importCandidateRovingIndex !== null
      ? stagedPendingImportRows[importCandidateRovingIndex]?.id
      : undefined;

  useLayoutEffect(() => {
    if (importCandidateRovingIndex === null || !activeStagedImportRowId) return;
    const wrap = document.querySelector(
      `[data-settings-import-candidate-row="${CSS.escape(activeStagedImportRowId)}"]`,
    );
    if (wrap instanceof HTMLElement) scrollPipelineWeddingRowIntoView(wrap);
    stagedImportApproveButtonRefs.current[importCandidateRovingIndex]?.focus({ preventScroll: true });
  }, [importCandidateRovingIndex, activeStagedImportRowId]);

  useEffect(() => {
    if (importTriggerStatus !== "success") return;
    const t = window.setTimeout(() => {
      setImportTriggerStatus("idle");
      setImportTriggerDetail(null);
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [importTriggerStatus]);

  async function fireTestLead() {
    try {
      setIsSimulating(true);
      setSimResult(null);
      /** Tenant for webhook-web comes from the Supabase session JWT on this invoke — not from body fields. */
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          lead: {
            name: "Sarah & James",
            email: "sarah.test@example.com",
            event_date: "2026-09-15",
            message:
              "Hi! We are getting married in Lake Como and absolutely love your editorial style. Are you available for our dates?",
          },
        },
      });
      if (error) throw error;
      setSimResult({ ok: true, message: "Lead sent — check Inbox for the AI pipeline result." });
    } catch (err: unknown) {
      setSimResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test lead." });
    } finally {
      setIsSimulating(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="w-full">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
          Studio profile, integrations, notifications, and tools.
        </p>
        <StudioBriefingEntryCard />
        {showManagerPreviewLink ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            <Link to="/manager/today" className="font-semibold text-foreground hover:underline">
              Studio manager preview
            </Link>
            {" — "}multi-photographer overview and team filtering (demo).
          </p>
        ) : null}
      </div>

      {/* ── General ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">General</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Studio identity and connectivity. Saved to <span className="font-mono text-[11px]">photographers.settings</span>{" "}
          (contract keys from Step 1A).
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Studio name</span>
            <input
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="Atelier · Elena Duarte"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.studio_name</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Default currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="EUR"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.currency</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Belgrade"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.timezone</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Manager name</span>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.manager_name</span>
          </label>
          <label className="md:col-span-2 space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Photographer names</span>
            <input
              value={photographerNames}
              onChange={(e) => setPhotographerNames(e.target.value)}
              placeholder="Elena & Marco"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.photographer_names</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Playbook version</span>
            <input
              value={playbookVersion}
              onChange={(e) => setPlaybookVersion(e.target.value)}
              placeholder="1 or 1.0.0"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.playbook_version</span>
          </label>
          <div className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Onboarding completed</span>
            <div className={inputCls + " text-muted-foreground"}>
              {onboardingCompletedAt ? onboardingCompletedAt : "—"}
            </div>
            <span className="text-[11px] text-muted-foreground">settings.onboarding_completed_at (read-only here)</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={profileSaving}
            onClick={saveProfileContract}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {profileSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
            {profileSaving ? "Saving…" : profileSaved ? "Profile saved" : "Save profile"}
          </button>
          {profileError ? <p className="text-[13px] text-red-500">{profileError}</p> : null}
        </div>
      </section>

      {/* ── Observability: one stat (execute_v3 §11.5C) ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Observability snapshot</h3>
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Phase 11.5 — single live readout only. Use it alongside rollout questions in{" "}
          <span className="font-mono text-[11px]">execute_v3.md</span> §11.5C (e.g. pressure from unresolved escalations).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="text-[13px] font-medium text-foreground">Open escalation requests</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {observabilityLoading ? "—" : openEscalationsCount ?? "—"}
            </span>
            <Link
              to="/today"
              className="text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              Open Today
            </Link>
          </div>
        </div>
        {observabilityError ? (
          <p className="mt-2 text-[13px] text-red-500">{observabilityError}</p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Verifier block telemetry (<span className="font-mono">blocks_by_verifier</span>) is structured JSON in Edge
            logs — filter <span className="font-mono">v315_telemetry</span>.
          </p>
        )}
      </section>

      {/* ── Operator number (Phase 11 Step 11A) ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Operator number</h3>
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          The number where Ana reaches you on the operator lane (blocked actions, escalations, slash commands). This is
          separate from the client-facing WhatsApp line under Integrations. Stored as{" "}
          <span className="font-mono text-[11px]">settings.admin_mobile_number</span> (E.164).
        </p>

        <div className="mt-5 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-foreground">Operator WhatsApp (E.164)</p>
          </div>
          <label className="mt-3 block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Mobile number</span>
            <input
              value={adminMobileNumber}
              onChange={(e) => {
                setAdminMobileNumber(e.target.value);
                setOpSaved(false);
              }}
              placeholder="+381601234567"
              className={inputCls}
              autoComplete="tel"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={opSaving}
              onClick={saveOperatorNumber}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
              {opSaving ? "Saving…" : opSaved ? "Saved" : "Save operator number"}
            </button>
            {opError ? <p className="text-[13px] text-red-500">{opError}</p> : null}
            {opSaved && !opError ? (
              <p className="text-[13px] text-emerald-600">Operator number updated.</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Integrations</h3>

        <div className="mt-5 space-y-3">
          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-foreground">Gmail (import)</p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Connect Gmail to stage historical threads for review. Imports stay in a staging buffer until you approve
              them — they are intended to land in the existing <span className="font-medium text-foreground">Inbox</span>{" "}
              as canonical threads, not a separate imports area. Inbox star and mark read/unread require the same
              connection; if those fail, use <span className="font-medium text-foreground">Reconnect Gmail</span> below to
              re-approve Google access.
            </p>
            {gmailOAuthFlash ? (
              <div
                className={cn(
                  "mt-3 rounded-lg border px-3 py-2 text-[13px]",
                  gmailOAuthFlash.type === "success"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200/95"
                    : "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200/95",
                )}
                role="status"
              >
                {gmailOAuthFlash.message}
              </div>
            ) : null}
            {gmailAccountLoading ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Loading Gmail connection…</p>
            ) : googleAccount ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted-foreground">Signed in as</span>
                  <span className="font-medium text-foreground">{googleAccount.email}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted-foreground">Sync status</span>
                  <span
                    className={cn(
                      "font-medium",
                      googleAccount.sync_status === "connected"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : googleAccount.sync_status === "error"
                          ? "text-red-600 dark:text-red-400"
                          : "text-foreground",
                    )}
                  >
                    {formatGmailSyncLabel(googleAccount.sync_status)}
                  </span>
                </div>
                {googleAccount.sync_error_summary ? (
                  <p
                    className={cn(
                      "text-[12px] leading-snug",
                      googleAccount.sync_status === "error"
                        ? "text-red-600/90 dark:text-red-400/90"
                        : "text-amber-800/90 dark:text-amber-400/90",
                    )}
                  >
                    {googleAccount.sync_error_summary}
                  </p>
                ) : null}
                <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
                  Imported threads are staged for review before they can enter Inbox — nothing is imported automatically
                  when you connect.
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-medium text-foreground">Staged import rows</span>
                  <span className="text-muted-foreground">
                    {stagedCountLoading ? "…" : stagedImportCount !== null ? `${stagedImportCount} in import_candidates` : "—"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Stays at 0 after a minute? Inngest may not be running the worker — confirm the app sync URL matches{" "}
                  <span className="font-mono text-[10px]">/functions/v1/inngest</span>, redeploy the{" "}
                  <span className="font-mono text-[10px]">inngest</span> function, and set secrets{" "}
                  <span className="font-mono text-[10px]">INNGEST_EVENT_KEY</span>,{" "}
                  <span className="font-mono text-[10px]">INNGEST_SIGNING_KEY</span>, and often{" "}
                  <span className="font-mono text-[10px]">INNGEST_ALLOW_IN_BAND_SYNC=1</span>.
                </p>
                <GmailRepairOpsPanel />
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <p className="text-[12px] font-medium text-foreground">Labels to sync (staging)</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Cached from Gmail · Last updated: {formatGmailLabelsRefreshedAt(gmailLabelsRefreshedAt)}
                    {gmailLabelCacheRefreshing ? (
                      <span className="font-medium text-foreground"> · Refreshing from Gmail…</span>
                    ) : null}
                  </p>
                  {gmailLabelsRefreshError ? (
                    <p className="text-[12px] leading-snug text-amber-800 dark:text-amber-200/90">
                      Label sync failed: {gmailLabelsRefreshError}
                    </p>
                  ) : null}
                  {gmailLabelsLoading ? (
                    <p className="text-[13px] text-muted-foreground">Loading label cache…</p>
                  ) : gmailLabelsError ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[13px] text-red-500">{gmailLabelsError}</p>
                      <button
                        type="button"
                        onClick={() => void loadGmailLabels(googleAccount.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground transition hover:bg-accent/40"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto rounded-md border border-border px-2 py-2">
                        {(() => {
                          const sorted = sortGmailLabelsForDisplay(gmailLabels);
                          if (sorted.length === 0) {
                            return (
                              <p className="text-[13px] text-muted-foreground">
                                {gmailLabelCacheRefreshing
                                  ? "Fetching labels from Gmail…"
                                  : "No labels in cache yet."}
                              </p>
                            );
                          }
                          return sorted.map((l) => (
                            <label
                              key={l.id}
                              className="flex cursor-pointer items-start gap-2 border-b border-border/60 py-2 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 accent-foreground"
                                checked={selectedLabelIds.includes(l.id)}
                                onChange={() => toggleGmailLabelSelection(l.id)}
                              />
                              <span className="text-[13px] leading-snug">
                                <span className="font-medium text-foreground">{l.name}</span>
                                <span className="ml-2 text-[11px] text-muted-foreground">{l.type}</span>
                              </span>
                            </label>
                          ));
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={gmailLabelsLoading}
                          onClick={() => void loadGmailLabels(googleAccount.id, { force: true })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {gmailLabelsRefreshError ? "Retry sync from Gmail" : "Refresh from Gmail"}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      disabled={
                        importTriggerStatus === "enqueuing" ||
                        selectedLabelIds.length === 0 ||
                        gmailLabelsLoading ||
                        !!gmailLabelsError ||
                        (gmailLabelCacheRefreshing && gmailLabels.length === 0) ||
                        googleAccount.sync_status === "syncing"
                      }
                      onClick={() => void importGmailThreadsFromLabels()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {importTriggerStatus === "enqueuing"
                        ? "Importing…"
                        : googleAccount.sync_status === "syncing"
                          ? "Account syncing…"
                          : "Import Gmail threads"}
                    </button>
                    {importTriggerDetail ? (
                      <p
                        className={cn(
                          "text-[13px]",
                          importTriggerStatus === "error"
                            ? "text-red-500"
                            : importTriggerStatus === "success"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {importTriggerDetail}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    type="button"
                    disabled={gmailConnectLoading}
                    onClick={() => void connectGmail()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {gmailConnectLoading ? "Redirecting…" : "Reconnect Gmail"}
                  </button>
                  {gmailConnectError ? (
                    <p className="text-[13px] text-red-500">{gmailConnectError}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={gmailConnectLoading}
                  onClick={() => void connectGmail()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {gmailConnectLoading ? "Redirecting…" : "Connect Gmail"}
                </button>
                {gmailConnectError ? (
                  <p className="text-[13px] text-red-500">{gmailConnectError}</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-foreground">Staged Gmail imports</p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Approve to create a real unfiled Inbox thread from staged Gmail data. Dismiss keeps it out of Inbox. Nothing
              appears in Inbox until you approve.
            </p>
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Label batches (G5):</span> threads imported from the same
              Gmail label share a batch. Use{" "}
              <span className="font-medium text-foreground">Approve batch → one project</span> to queue background
              materialization (chunked) into one Pipeline wedding — or approve rows individually for unfiled Inbox only.
              Large batches are processed in chunks (up to {GMAIL_GROUP_APPROVE_MAX_ROWS_PER_RUN} threads per background
              run); if a run stops early, use Retry pending rows or approve individually.
            </p>
            {groupApproveNotice ? (
              <div
                className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-900 dark:text-emerald-100/95"
                role="status"
              >
                <span>Batch approved — project created for “{groupApproveNotice.label}”. </span>
                <Link
                  to={`/pipeline/${encodeURIComponent(groupApproveNotice.weddingId)}`}
                  className="font-semibold underline underline-offset-2"
                >
                  Open in Pipeline
                </Link>
                <button
                  type="button"
                  className="ml-2 text-[11px] text-muted-foreground underline"
                  onClick={() => setGroupApproveNotice(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {importReviewError ? (
              <p className="mt-2 text-[12px] text-red-600 dark:text-red-400" role="alert">
                {importReviewError}
              </p>
            ) : null}
            {importCandidatesLoading ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Loading staged imports…</p>
            ) : importCandidatesListError ? (
              <div
                className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300/95"
                role="alert"
              >
                <p className="font-medium">Could not load staged imports</p>
                <p className="mt-1 font-mono text-[11px] leading-snug opacity-95">{importCandidatesListError}</p>
                <p className="mt-2 text-[12px] text-red-800/90 dark:text-red-200/85">
                  If this mentions an unknown column (e.g. <span className="font-mono">materialized_thread_id</span>),
                  apply migration <span className="font-mono">20260427120000_import_candidates_materialization</span> on
                  hosted Supabase, then refresh.
                </p>
              </div>
            ) : importCandidates.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No import candidates yet — run a label sync above, then refresh or wait a few seconds.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {labelBatchCards.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[12px] font-medium text-foreground">Pending label batches</p>
                    {labelBatchCards.map(([groupId, { rows, groupMeta }]) => {
                      const label = rows[0]?.source_label_name ?? groupMeta?.source_label_name ?? "Gmail label";
                      const groupBusy = importReviewBusyId === `group:${groupId}`;
                      const st = groupMeta?.status ?? "pending";
                      const approving = st === "approving";
                      const total = groupMeta?.approval_total_candidates ?? rows.length;
                      const processed = groupMeta?.approval_processed_count ?? 0;
                      const failed = groupMeta?.approval_failed_count ?? 0;
                      const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
                      return (
                        <div
                          key={groupId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-accent/20 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground">{label}</p>
                            {approving ? (
                              <div className="mt-1 space-y-1">
                                <p className="text-[11px] text-amber-800 dark:text-amber-300/95">
                                  Import running in the background… {processed} / {total} processed
                                  {failed > 0 ? ` · ${failed} failed` : ""}
                                </p>
                                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary/70 transition-[width]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                {rows.length} thread{rows.length === 1 ? "" : "s"} staged — approval queues a background
                                job
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={groupBusy || approving}
                              onClick={() => void reviewLabelGroup(groupId, "approve_group", label)}
                              className={cn(
                                "rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition",
                                groupBusy || approving
                                  ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                                  : "cursor-pointer border-primary/45 bg-primary/15 text-foreground hover:bg-primary/20",
                              )}
                            >
                              {approving ? "Queued…" : groupBusy ? "…" : "Approve batch → one project"}
                            </button>
                            <button
                              type="button"
                              disabled={groupBusy || approving}
                              onClick={() => void reviewLabelGroup(groupId, "dismiss_group", label)}
                              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent/40 disabled:opacity-60"
                            >
                              Dismiss batch
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {recoveryGroupCards.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[12px] font-medium text-foreground">Batch needs attention</p>
                    <p className="text-[11px] text-muted-foreground">
                      Partial or interrupted import — pending threads below can be retried in one background job, or
                      approved one at a time.
                    </p>
                    {recoveryGroupCards.map((g) => {
                      const label = g.source_label_name ?? "Gmail label";
                      const pendingN = importCandidates.filter(
                        (c) =>
                          c.gmail_label_import_group_id === g.id &&
                          normalizeImportCandidateStatus(c.status) === "pending",
                      ).length;
                      const failedN = g.approval_failed_count ?? 0;
                      const busy = importReviewBusyId === `group-retry:${g.id}`;
                      const isPartial = g.status === "partially_approved";
                      return (
                        <div
                          key={g.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 dark:bg-amber-500/5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground">{label}</p>
                            <p className="text-[11px] text-amber-900/95 dark:text-amber-200/90">
                              {isPartial ? "Partially imported" : "Import did not complete"} — {pendingN} pending
                              {failedN > 0 ? ` · ${failedN} failed in last run` : ""}
                              {g.approval_total_candidates != null && g.approval_total_candidates > 0 ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  (last run: {g.approval_processed_count ?? 0} / {g.approval_total_candidates}{" "}
                                  processed)
                                </span>
                              ) : null}
                            </p>
                            {g.approval_last_error ? (
                              <p className="mt-1 text-[11px] leading-snug text-red-700 dark:text-red-400/95">
                                {g.approval_last_error}
                              </p>
                            ) : null}
                            {g.materialized_wedding_id ? (
                              <p className="mt-1 text-[11px]">
                                <Link
                                  to={`/pipeline/${encodeURIComponent(g.materialized_wedding_id)}`}
                                  className="font-semibold text-foreground underline underline-offset-2"
                                >
                                  Open project in Pipeline
                                </Link>
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void retryLabelGroup(g.id, label)}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition",
                              busy
                                ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                                : "cursor-pointer border-amber-600/50 bg-amber-500/20 text-foreground hover:bg-amber-500/30",
                            )}
                          >
                            {busy ? "…" : "Retry pending rows"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div
                  ref={stagedImportCandidatesListRef}
                  className={cn(
                    "overflow-x-auto",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  tabIndex={
                    stagedPendingImportRows.length === 0 ? -1 : importCandidateRovingIndex === null ? 0 : -1
                  }
                  role="listbox"
                  aria-label="Staged import candidates"
                  aria-activedescendant={
                    activeStagedImportRowId ? `settings-import-approve-${activeStagedImportRowId}` : undefined
                  }
                  onKeyDownCapture={handleStagedImportListKeyDownCapture}
                >
                <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Subject / snippet</th>
                      <th className="py-2 pr-2 font-medium">Label</th>
                      <th className="py-2 pr-2 font-medium">Msgs</th>
                      <th className="py-2 pr-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importCandidates.map((row) => {
                      const statusNorm = normalizeImportCandidateStatus(row.status);
                      const reviewBusy = importReviewBusyId === row.id;
                      const pendingIdx =
                        statusNorm === "pending" ? (stagedPendingIndexByCandidateId.get(row.id) ?? -1) : -1;
                      return (
                        <tr
                          key={row.id}
                          data-settings-import-candidate-row={row.id}
                          className={cn(
                            "border-b border-border/70",
                            pendingIdx >= 0 &&
                              importCandidateRovingIndex === pendingIdx &&
                              "bg-accent/25 ring-2 ring-inset ring-ring/45",
                          )}
                        >
                          <td className="max-w-[200px] py-2 pr-2 align-top">
                            <div className="font-medium text-foreground">{row.subject?.trim() || "(no subject)"}</div>
                            <div className="mt-0.5 line-clamp-2 text-muted-foreground">{row.snippet || "—"}</div>
                          </td>
                          <td className="py-2 pr-2 align-top text-muted-foreground">{row.source_label_name}</td>
                          <td className="py-2 pr-2 align-top tabular-nums">{row.message_count}</td>
                          <td className="py-2 pr-2 align-top">
                            <span
                              className={cn(
                                statusNorm === "pending" && "text-amber-700 dark:text-amber-400",
                                statusNorm === "approving" && "text-amber-700 dark:text-amber-400",
                                statusNorm === "approved" && "text-emerald-700 dark:text-emerald-400",
                                statusNorm === "dismissed" && "text-muted-foreground",
                              )}
                            >
                              {statusNorm === "approving" ? "approving (queued)" : row.status?.trim() ?? row.status}
                            </span>
                            {statusNorm === "pending" && row.import_approval_error ? (
                              <div className="mt-1 text-[10px] leading-snug text-red-600 dark:text-red-400">
                                Batch import: {row.import_approval_error.slice(0, 180)}
                                {row.import_approval_error.length > 180 ? "…" : ""}
                              </div>
                            ) : null}
                          </td>
                          <td className="relative z-10 py-2 align-top">
                            {statusNorm === "pending" ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  id={pendingIdx >= 0 ? `settings-import-approve-${row.id}` : undefined}
                                  ref={(el) => {
                                    if (pendingIdx >= 0) stagedImportApproveButtonRefs.current[pendingIdx] = el;
                                  }}
                                  type="button"
                                  role="option"
                                  tabIndex={
                                    pendingIdx >= 0 && importCandidateRovingIndex === pendingIdx ? 0 : -1
                                  }
                                  aria-selected={pendingIdx >= 0 && importCandidateRovingIndex === pendingIdx}
                                  disabled={reviewBusy}
                                  title={
                                    reviewBusy
                                      ? "Working…"
                                      : "Create a canonical unfiled Inbox thread from this staged import"
                                  }
                                  onClick={() => {
                                    if (pendingIdx >= 0) setImportCandidateRovingIndex(pendingIdx);
                                    void reviewImportCandidate(row.id, "approve");
                                  }}
                                  className={cn(
                                    "rounded-md border px-2 py-1 text-[11px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                                    reviewBusy
                                      ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60"
                                      : "cursor-pointer border-primary/45 bg-primary/10 text-foreground hover:bg-primary/15",
                                  )}
                                >
                                  {reviewBusy ? "…" : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewBusy}
                                  title={reviewBusy ? "Working…" : "Keep this import out of Inbox"}
                                  onClick={() => {
                                    if (pendingIdx >= 0) setImportCandidateRovingIndex(pendingIdx);
                                    void reviewImportCandidate(row.id, "dismiss");
                                  }}
                                  className={cn(
                                    "rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition",
                                    reviewBusy
                                      ? "cursor-not-allowed opacity-60"
                                      : "cursor-pointer hover:bg-accent/40",
                                  )}
                                >
                                  Dismiss
                                </button>
                              </div>
                            ) : statusNorm === "approving" ? (
                              <span className="text-[11px] text-muted-foreground">Queued…</span>
                            ) : statusNorm === "approved" && row.materialized_thread_id ? (
                              <Link
                                to={`/inbox?threadId=${encodeURIComponent(row.materialized_thread_id)}`}
                                className="text-[11px] font-semibold text-foreground underline-offset-2 hover:underline"
                              >
                                Open in Inbox
                              </Link>
                            ) : statusNorm === "approved" && !row.materialized_thread_id ? (
                              <span className="text-[11px] text-amber-800 dark:text-amber-300">
                                Approved — run DB migration{" "}
                                <span className="font-mono text-[10px]">20260427120000_import_candidates_materialization</span>{" "}
                                if Inbox link is missing
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#25D366]" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-foreground">AI Assistant WhatsApp Connection</p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Link your phone number so the AI assistant can receive WhatsApp messages and route them through the pipeline.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <label className="shrink-0 space-y-1 text-[13px]">
                <span className="font-medium text-foreground">Country</span>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="block w-[200px] rounded-lg border border-border bg-background px-2 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={`${c.code}-${c.label}`} value={c.code}>
                      {c.flag} {c.label} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1 space-y-1 text-[13px]">
                <span className="font-medium text-foreground">Phone number</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="612345678"
                  className={inputCls + " block"}
                />
              </label>
              <button
                type="button"
                disabled={waSaving}
                onClick={saveWhatsAppNumber}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {waSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                {waSaving ? "Saving\u2026" : waSaved ? "Saved" : "Save"}
              </button>
            </div>
            {waError ? (
              <p className="mt-2 text-[13px] text-red-500">{waError}</p>
            ) : null}
            {waSaved && !waError ? (
              <p className="mt-2 text-[13px] text-emerald-600">
                WhatsApp number linked — {countryCode}{phoneNumber}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Notifications ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Notifications</h3>

        <div className="mt-5 space-y-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <span className="text-[13px] font-medium text-foreground">Drafts awaiting approval</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-foreground" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <span className="text-[13px] font-medium text-foreground">Unfiled messages digest</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-foreground" />
          </label>
        </div>
      </section>

      {/* ── AI & Tone ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">AI & Tone</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Upload a short style guide — Atelier retrieves it before drafting. Negative constraints are enforced in the orchestration layer.
        </p>
        <div className="mt-5">
          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-border bg-background px-4 py-6 text-left text-[13px] font-medium text-muted-foreground transition hover:bg-accent/40 md:max-w-md"
          >
            Upload tone examples
          </button>
        </div>
      </section>

      {/* ── Developer Tools ── */}
      <section className="mt-10 mb-6">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Developer Tools</h3>
        <div className="mt-5 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] shadow-md"
                style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }}
              >
                <FlaskConical className="h-4 w-4 text-white" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Simulate Incoming Lead</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Fire a test inquiry through{" "}
                  <span className="font-mono text-[11px]">webhook-web</span>{" "}
                  to validate the AI pipeline end-to-end.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fireTestLead}
              disabled={isSimulating}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSimulating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {isSimulating ? "Sending…" : "Send Test Lead"}
            </button>
          </div>
          {simResult && (
            <div
              className={cn(
                "mt-3 rounded-lg px-4 py-2 text-[13px]",
                simResult.ok
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border border-red-500/20 bg-red-500/10 text-red-600",
              )}
            >
              {simResult.message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
