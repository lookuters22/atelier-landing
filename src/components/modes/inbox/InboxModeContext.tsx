/* eslint-disable react-refresh/only-export-components -- module exports inbox mode hook + provider */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import type { InboxFolder, InboxListTab } from "../../../lib/inboxVisibleThreads";

export type InboxSelection =
  | { kind: "none" }
  | { kind: "thread"; thread: UnfiledThread }
  | { kind: "project"; projectId: string; projectName: string };

interface InboxModeState {
  selection: InboxSelection;
  /** One-shot: inbox URL hydrator sets this so project timeline selects the draft’s thread; consumed in InboxWorkspace then cleared. */
  pendingInboxPipelineThreadId: string | null;
  setPendingInboxPipelineThreadId: (id: string | null) => void;
  /** Set when a draft (or fetch) deep link could not be applied; cleared on dismiss or any explicit selection change. */
  inboxUrlNotice: string | null;
  setInboxUrlNotice: (msg: string | null) => void;
  selectThread: (t: UnfiledThread) => void;
  /**
   * Embeds the **pipeline timeline** (`PipelineTimelinePane`) inside the Inbox route. Reserved for draft URL
   * hydration and other explicit CRM-deep-link flows — not for sidebar navigation. For “this project’s mail in
   * inbox”, use `setProjectFilterWeddingId` + `backToList()` instead.
   */
  selectProject: (id: string, name: string) => void;
  /** Full reset: selection, notices, pending handoff — unchanged semantics for existing callers. */
  clearSelection: () => void;
  /** Return to list view without clearing nav filters or search (thread detail → list). */
  backToList: () => void;
  /** Two-column list + thread: when false, list spans full center width; selection may remain for row highlight. */
  threadDetailOpen: boolean;
  /** Hide thread column; keep selected thread for list highlight. */
  collapseThreadDetail: () => void;

  inboxFolder: InboxFolder;
  setInboxFolder: (f: InboxFolder) => void;
  listTab: InboxListTab;
  setListTab: (t: InboxListTab) => void;
  projectFilterWeddingId: string | null;
  setProjectFilterWeddingId: (id: string | null) => void;
  gmailLabelFilterId: string | null;
  setGmailLabelFilterId: (id: string | null) => void;
  /**
   * Left rail: `Primary` vs `All mail` (both `inbox` folder in product — matches static HTML two-row inbox scope).
   */
  inboxMailScope: "primary" | "all_mail";
  setInboxMailScope: (s: "primary" | "all_mail") => void;
  /** New message compose (scratch) — separate from thread reply. */
  scratchComposeOpen: boolean;
  setScratchComposeOpen: (open: boolean) => void;
}

const Ctx = createContext<InboxModeState | null>(null);

export function InboxModeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<InboxSelection>({ kind: "none" });
  const [pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId] = useState<string | null>(null);
  const [inboxUrlNotice, setInboxUrlNotice] = useState<string | null>(null);

  const [inboxFolder, setInboxFolder] = useState<InboxFolder>("inbox");
  const [listTab, setListTab] = useState<InboxListTab>("all");
  const [projectFilterWeddingId, setProjectFilterWeddingId] = useState<string | null>(null);
  const [gmailLabelFilterId, setGmailLabelFilterId] = useState<string | null>(null);
  const [inboxMailScope, setInboxMailScope] = useState<"primary" | "all_mail">("primary");
  const [scratchComposeOpen, setScratchComposeOpen] = useState(false);
  const [threadDetailOpen, setThreadDetailOpen] = useState(true);

  const selectThread = useCallback((t: UnfiledThread) => {
    setInboxUrlNotice(null);
    setPendingInboxPipelineThreadId(null);
    setScratchComposeOpen(false);
    setThreadDetailOpen(true);
    setSelection({ kind: "thread", thread: t });
  }, []);

  /** Does not clear `pendingInboxPipelineThreadId` — URL hydrator sets pending after this for draft review deep links. */
  const selectProject = useCallback((id: string, name: string) => {
    setInboxUrlNotice(null);
    setScratchComposeOpen(false);
    setThreadDetailOpen(true);
    setSelection({ kind: "project", projectId: id, projectName: name });
  }, []);

  const clearSelection = useCallback(() => {
    setInboxUrlNotice(null);
    setPendingInboxPipelineThreadId(null);
    setScratchComposeOpen(false);
    setThreadDetailOpen(true);
    setSelection({ kind: "none" });
  }, []);

  const backToList = useCallback(() => {
    setThreadDetailOpen(true);
    setSelection({ kind: "none" });
  }, []);

  const collapseThreadDetail = useCallback(() => {
    if (selection.kind !== "thread") return;
    setThreadDetailOpen(false);
  }, [selection.kind]);

  return (
    <Ctx.Provider
      value={{
        selection,
        pendingInboxPipelineThreadId,
        setPendingInboxPipelineThreadId,
        inboxUrlNotice,
        setInboxUrlNotice,
        selectThread,
        selectProject,
        clearSelection,
        backToList,
        threadDetailOpen,
        collapseThreadDetail,
        inboxFolder,
        setInboxFolder,
        listTab,
        setListTab,
        projectFilterWeddingId,
        setProjectFilterWeddingId,
        gmailLabelFilterId,
        setGmailLabelFilterId,
        inboxMailScope,
        setInboxMailScope,
        scratchComposeOpen,
        setScratchComposeOpen,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useInboxMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInboxMode must be used within InboxModeProvider");
  return ctx;
}
