import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  MapPin,
  Paperclip,
  PenLine,
  Plus,
  Reply,
  ReplyAll,
  Shield,
  Trash2,
  Users,
  X,
  Sparkles,
} from "lucide-react";
import { WEDDING_IDS, type WeddingEntry, type WeddingId } from "../data/weddingCatalog";
import { resolveWeddingEntry } from "../data/weddingRegistry";
import { WEDDING_PEOPLE_DEFAULTS, type WeddingPersonRow } from "../data/weddingPeopleDefaults";
import {
  loadWeddingDetailPersisted,
  saveWeddingDetailPersisted,
  type WeddingFieldsEditable,
} from "../lib/weddingDetailStorage";
import { getTravelForWedding } from "../data/weddingTravel";
import {
  WEDDING_THREAD_DRAFT_DEFAULT,
  getMessagesForThread,
  getThreadById,
  getThreadsForWedding,
  messageFoldKey,
  type WeddingThreadMessage,
} from "../data/weddingThreads";
import { WeddingFinancialsPanel } from "../components/WeddingFinancialsPanel";
import { TravelTabPanel } from "../components/TravelTabPanel";

type TabId = "timeline" | "thread" | "tasks" | "files" | "financials" | "travel";

const TAB_IDS: TabId[] = ["timeline", "thread", "tasks", "files", "financials", "travel"];

function parseTabParam(v: string | null): TabId | null {
  if (!v) return null;
  return (TAB_IDS as readonly string[]).includes(v) ? (v as TabId) : null;
}

type ReplyScope = "reply" | "replyAll";

const DRAFT_DEFAULT = WEDDING_THREAD_DRAFT_DEFAULT;

function senderInitials(sender: string): string {
  const parts = sender.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

/** Full-width row; click header to fold/unfold body */
function FoldableTimelineMessage({
  msg,
  expanded,
  onToggle,
}: {
  msg: WeddingThreadMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const incoming = msg.direction === "in";
  const initials = incoming ? senderInitials(msg.sender) : "ED";
  return (
    <article
      className={
        "w-full rounded-lg border text-[13px] " +
        (incoming
          ? "border-border/80 bg-surface"
          : "border-border/80 bg-accent/[0.06]")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.025]"
      >
        <ChevronDown
          className={"mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition " + (expanded ? "rotate-180" : "")}
          strokeWidth={2}
          aria-hidden
        />
        <div
          className={
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
            (incoming ? "border border-border/80 bg-canvas text-ink-muted" : "bg-sidebar text-white")
          }
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
            <span className="font-semibold text-ink">{msg.sender}</span>
            <time className="shrink-0 text-[11px] tabular-nums text-ink-faint">{msg.time}</time>
          </div>
          {msg.subject ? (
            <p className="mt-0.5 text-[12px] font-semibold leading-snug text-ink-muted">{msg.subject}</p>
          ) : null}
          {!expanded ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{msg.body}</p>
          ) : null}
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 sm:pl-[3.25rem]">
          {msg.meta ? <p className="text-[11px] text-ink-faint">{msg.meta}</p> : null}
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{msg.body}</p>
        </div>
      ) : null}
    </article>
  );
}

function isBuiltInWeddingId(id: string): id is WeddingId {
  return (WEDDING_IDS as readonly string[]).includes(id);
}

/** First email found in People rows (e.g. "Planner · name@site.com"). */
function firstEmailFromPeople(rows: WeddingPersonRow[]): string | null {
  for (const p of rows) {
    const m = p.subtitle.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (m) return m[0];
  }
  return null;
}

function buildPersistedDefaults(weddingId: string, entry: WeddingEntry) {
  const people = isBuiltInWeddingId(weddingId)
    ? WEDDING_PEOPLE_DEFAULTS[weddingId]
    : [{ id: `${weddingId}-p1`, name: "", subtitle: "" }];
  return {
    wedding: {
      couple: entry.couple,
      when: entry.when,
      where: entry.where,
      stage: entry.stage,
      package: entry.package,
      value: entry.value,
      balance: entry.balance,
    },
    people,
    photographerNotes: "",
  };
}

function WeddingDetailInner({ weddingId, entry }: { weddingId: string; entry: WeddingEntry }) {
  const w = entry;
  const [searchParams, setSearchParams] = useSearchParams();
  const threads = getThreadsForWedding(weddingId);
  const travelPlan = getTravelForWedding(weddingId);

  const [weddingFields, setWeddingFields] = useState<WeddingFieldsEditable>(() =>
    loadWeddingDetailPersisted(weddingId, buildPersistedDefaults(weddingId, entry)).wedding,
  );
  const [people, setPeople] = useState<WeddingPersonRow[]>(() =>
    loadWeddingDetailPersisted(weddingId, buildPersistedDefaults(weddingId, entry)).people,
  );
  const [photographerNotes, setPhotographerNotes] = useState(() =>
    loadWeddingDetailPersisted(weddingId, buildPersistedDefaults(weddingId, entry)).photographerNotes,
  );
  const [editingWedding, setEditingWedding] = useState(false);
  const [editingPeople, setEditingPeople] = useState(false);
  const weddingBackupRef = useRef<WeddingFieldsEditable | null>(null);
  const peopleBackupRef = useRef<WeddingPersonRow[] | null>(null);
  const weddingFieldsRef = useRef(weddingFields);
  const peopleRef = useRef(people);
  weddingFieldsRef.current = weddingFields;
  peopleRef.current = people;

  const [tab, setTab] = useState<TabId>(() => parseTabParam(searchParams.get("tab")) ?? "timeline");

  useEffect(() => {
    const t = parseTabParam(searchParams.get("tab"));
    if (t) setTab(t);
  }, [searchParams]);

  const setTabAndUrl = (next: TabId) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", next);
        return n;
      },
      { replace: true },
    );
  };
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"reply" | "internal">("reply");
  const [toast, setToast] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("Re: Timeline v3 — photography coverage");
  const [body, setBody] = useState(DRAFT_DEFAULT);
  /** Inline footer reply (chat-style); full composer can pull from this */
  const [replyBody, setReplyBody] = useState("");
  const [replyScope, setReplyScope] = useState<ReplyScope>("reply");
  const replyAreaRef = useRef<HTMLTextAreaElement>(null);
  const [internalBody, setInternalBody] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState(() => threads[0]?.id ?? "");
  /** Per-thread draft still pending (demo) */
  const [draftPendingByThread, setDraftPendingByThread] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    for (const t of threads) {
      if (t.hasPendingDraft) d[t.id] = true;
    }
    return d;
  });
  /** Per-message fold keys: `${threadId}:${messageId}` */
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const [draftExpanded, setDraftExpanded] = useState(true);

  const activeThread = getThreadById(selectedThreadId) ?? threads[0];
  const timelineMessages = activeThread ? getMessagesForThread(activeThread.id) : [];
  const earlierMessages = timelineMessages.filter((m) => m.daySegment === "earlier");
  const todayMessages = timelineMessages.filter((m) => m.daySegment === "today");
  const showDraft =
    activeThread?.hasPendingDraft === true && draftPendingByThread[activeThread.id] === true;

  const replyMeta = useMemo(() => {
    const fromPeople = firstEmailFromPeople(people);
    if (!activeThread) {
      return { toAddr: fromPeople, subjectLine: "Re: …" };
    }
    const msgs = getMessagesForThread(activeThread.id);
    const last = msgs[msgs.length - 1];
    const lastMeta = last?.meta?.trim();
    const toFromMeta = lastMeta && lastMeta.includes("@") ? lastMeta : undefined;
    const toAddr = activeThread.composerTo ?? toFromMeta ?? fromPeople ?? null;
    const subjectLine =
      activeThread.composerSubjectDefault ??
      (last?.subject ? `Re: ${last.subject}` : "Re: …");
    return { toAddr, subjectLine };
  }, [activeThread, people]);

  useEffect(() => {
    const t = getThreadsForWedding(weddingId);
    setSelectedThreadId(t[0]?.id ?? "");
    const d: Record<string, boolean> = {};
    for (const th of t) {
      if (th.hasPendingDraft) d[th.id] = true;
    }
    setDraftPendingByThread(d);
    setMessageExpanded({});
  }, [weddingId]);

  useEffect(() => {
    const e = resolveWeddingEntry(weddingId);
    if (!e) return;
    const loaded = loadWeddingDetailPersisted(weddingId, buildPersistedDefaults(weddingId, e));
    setWeddingFields(loaded.wedding);
    setPeople(loaded.people);
    setPhotographerNotes(loaded.photographerNotes);
    setEditingWedding(false);
    setEditingPeople(false);
  }, [weddingId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveWeddingDetailPersisted(weddingId, {
        wedding: weddingFieldsRef.current,
        people: peopleRef.current,
        photographerNotes,
      });
    }, 650);
    return () => window.clearTimeout(t);
  }, [photographerNotes, weddingId]);

  useEffect(() => {
    setReplyBody("");
    setReplyScope("reply");
    setCc("");
  }, [selectedThreadId]);

  function toggleMessage(foldKey: string) {
    setMessageExpanded((prev) => ({ ...prev, [foldKey]: !prev[foldKey] }));
  }

  function defaultExpandedForMessage(msg: WeddingThreadMessage): boolean {
    return msg.daySegment === "today";
  }

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  function showToast(msg: string) {
    setToast(msg);
  }

  function applyComposerDefaultsFromThread() {
    if (!activeThread) return;
    const msgs = getMessagesForThread(activeThread.id);
    const last = msgs[msgs.length - 1];
    const lastMeta = last?.meta?.trim();
    const toFromMeta =
      lastMeta && lastMeta.includes("@") ? lastMeta : undefined;
    const fromPeople = firstEmailFromPeople(people);
    setTo(activeThread.composerTo ?? toFromMeta ?? fromPeople ?? "");
    const subj =
      activeThread.composerSubjectDefault ??
      (last?.subject ? `Re: ${last.subject}` : subject);
    setSubject(subj);
  }

  /** Sync To/Cc/Subject for modal + inline Reply vs Reply all (demo recipients). */
  function applyReplyScope(scope: ReplyScope) {
    setReplyScope(scope);
    applyComposerDefaultsFromThread();
    if (scope === "reply") {
      setCc("");
    } else {
      setCc(firstEmailFromPeople(people) ? "sofia@email.com, marco@email.com" : "");
    }
  }

  function openComposer(kind: "reply" | "internal") {
    setComposerKind(kind);
    if (kind === "reply") {
      applyComposerDefaultsFromThread();
      if (replyScope === "reply") {
        setCc("");
      } else {
        setCc(firstEmailFromPeople(people) ? "sofia@email.com, marco@email.com" : "");
      }
      const pending =
        activeThread &&
        activeThread.hasPendingDraft === true &&
        draftPendingByThread[activeThread.id] === true;
      setBody(
        replyBody.trim() ? replyBody : pending ? DRAFT_DEFAULT : body.trim() ? body : "",
      );
    }
    setComposerOpen(true);
  }

  function submitInlineForApproval() {
    if (!replyBody.trim()) {
      showToast("Add a message in the box, or tap Generate response.");
      return;
    }
    if (!replyMeta.toAddr) {
      showToast("Add someone under People with an email.");
      return;
    }
    showToast("Draft submitted for approval — check Approvals (demo).");
    setReplyBody("");
  }

  function approveDraft() {
    if (!activeThread) return;
    setDraftPendingByThread((prev) => ({ ...prev, [activeThread.id]: false }));
    showToast("Message queued — sent to Elena Rossi Planning (demo).");
  }

  function editDraftInComposer() {
    applyReplyScope("reply");
    setReplyBody(DRAFT_DEFAULT);
    window.requestAnimationFrame(() => replyAreaRef.current?.focus());
  }

  function sendComposer() {
    if (composerKind === "internal") {
      showToast("Internal note saved on this wedding (demo).");
      setInternalBody("");
    } else {
      showToast("Draft submitted for approval — check Approvals (demo).");
      setReplyBody("");
    }
    setComposerOpen(false);
  }

  function requestAiDraft() {
    setBody((b) => b + "\\n\\n[AI] Added a warmer sign-off and confirmed vendor meals per thread context.");
    showToast("AI draft inserted — review before sending.");
  }

  function generateInlineResponse() {
    const incoming = activeThread
      ? getMessagesForThread(activeThread.id).filter((m) => m.direction === "in")
      : [];
    const lastIn = incoming[incoming.length - 1];
    const rawTopic =
      lastIn?.subject?.replace(/^Re:\s*/i, "").trim() ||
      replyMeta.subjectLine.replace(/^Re:\s*/i, "").trim();
    const topicOk = rawTopic && rawTopic !== "…" && !rawTopic.startsWith("Re:");
    const draft = topicOk
      ? `Thanks — I’ve reviewed “${rawTopic}”. I’ll confirm coverage and next steps shortly.`
      : "Thanks — I’ve reviewed your note. I’ll confirm coverage and next steps shortly.";
    setReplyBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${draft}` : draft));
    showToast("Reply drafted — review and edit before sending.");
    window.requestAnimationFrame(() => replyAreaRef.current?.focus());
  }

  function regenerateSummary() {
    setSummaryBusy(true);
    window.setTimeout(() => {
      setSummaryBusy(false);
      showToast("Summary refreshed from the last 30 messages (demo).");
    }, 900);
  }

  function persistWeddingDetail() {
    saveWeddingDetailPersisted(weddingId, {
      wedding: weddingFields,
      people,
      photographerNotes,
    });
  }

  function startEditWedding() {
    weddingBackupRef.current = { ...weddingFields };
    setEditingWedding(true);
  }

  function cancelEditWedding() {
    if (weddingBackupRef.current) setWeddingFields(weddingBackupRef.current);
    setEditingWedding(false);
  }

  function saveEditWedding() {
    persistWeddingDetail();
    showToast("Wedding details saved.");
    setEditingWedding(false);
  }

  function startEditPeople() {
    peopleBackupRef.current = people.map((p) => ({ ...p }));
    setEditingPeople(true);
  }

  function cancelEditPeople() {
    if (peopleBackupRef.current) setPeople(peopleBackupRef.current.map((p) => ({ ...p })));
    setEditingPeople(false);
  }

  function saveEditPeople() {
    persistWeddingDetail();
    showToast("People updated.");
    setEditingPeople(false);
  }

  function addPersonRow() {
    setPeople((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "",
        subtitle: "",
      },
    ]);
  }

  function removePersonRow(id: string) {
    setPeople((prev) => prev.filter((p) => p.id !== id));
  }

  function updatePerson(id: string, patch: Partial<WeddingPersonRow>) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function tabBtn(id: TabId, label: string) {
    const on = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTabAndUrl(id)}
        className={
          "rounded-full px-3 py-1 text-[12px] font-semibold transition " +
          (on ? "bg-canvas text-ink" : "text-ink-muted hover:bg-canvas")
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="relative grid min-h-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:items-start">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-full border border-border bg-surface px-5 py-2.5 text-[13px] font-medium text-ink ring-1 ring-black/[0.06]">
          {toast}
        </div>
      ) : null}

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Wedding</p>
            {!editingWedding ? (
              <button
                type="button"
                onClick={startEditWedding}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
              >
                <PenLine className="h-3 w-3" strokeWidth={2} />
                Edit
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={cancelEditWedding}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditWedding}
                  className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas"
                >
                  Save
                </button>
              </div>
            )}
          </div>
          {!editingWedding ? (
            <>
              <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">{weddingFields.couple}</h1>
              <span className="mt-2 inline-block rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-ink-muted">
                {weddingFields.stage}
              </span>
              <div className="mt-4 space-y-3 text-[13px] text-ink-muted">
                <p className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
                  {weddingFields.when}
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
                  {weddingFields.where}
                </p>
              </div>
              <div className="mt-5 rounded-xl bg-canvas p-4">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Commercial</p>
                <p className="mt-2 text-[14px] font-semibold text-ink">{weddingFields.package}</p>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-ink-faint">Contract value</p>
                    <p className="text-[16px] font-semibold text-ink">{weddingFields.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-ink-faint">Status</p>
                    <p className="text-[13px] font-semibold text-ink">{weddingFields.balance}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block text-[11px] font-semibold text-ink-muted">
                Couple / title
                <input
                  value={weddingFields.couple}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, couple: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[14px] font-semibold text-ink"
                />
              </label>
              <label className="block text-[11px] font-semibold text-ink-muted">
                Stage
                <input
                  value={weddingFields.stage}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, stage: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-semibold text-ink-muted">
                When
                <input
                  value={weddingFields.when}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, when: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-semibold text-ink-muted">
                Where
                <input
                  value={weddingFields.where}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, where: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
                />
              </label>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Commercial</p>
                <label className="mt-2 block text-[11px] font-semibold text-ink-muted">
                  Package
                  <input
                    value={weddingFields.package}
                    onChange={(e) => setWeddingFields((f) => ({ ...f, package: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                  />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-[11px] font-semibold text-ink-muted">
                    Value
                    <input
                      value={weddingFields.value}
                      onChange={(e) => setWeddingFields((f) => ({ ...f, value: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-ink-muted">
                    Balance / status
                    <input
                      value={weddingFields.balance}
                      onChange={(e) => setWeddingFields((f) => ({ ...f, balance: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
              <p className="text-[13px] font-semibold text-ink">People</p>
            </div>
            {!editingPeople ? (
              <button
                type="button"
                onClick={startEditPeople}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
              >
                <PenLine className="h-3 w-3" strokeWidth={2} />
                Edit
              </button>
            ) : (
              <div className="flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  onClick={cancelEditPeople}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditPeople}
                  className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas"
                >
                  Save
                </button>
              </div>
            )}
          </div>
          {!editingPeople ? (
            <ul className="mt-3 space-y-3 text-[13px] text-ink-muted">
              {people.map((p) => (
                <li key={p.id}>
                  <p className="font-semibold text-ink">{p.name || "—"}</p>
                  <p>{p.subtitle || "—"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-3 space-y-3">
              {people.map((p) => (
                <li key={p.id} className="rounded-lg border border-border bg-canvas p-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={p.name}
                        onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                        placeholder="Name"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[13px] font-semibold text-ink"
                      />
                      <input
                        value={p.subtitle}
                        onChange={(e) => updatePerson(p.id, { subtitle: e.target.value })}
                        placeholder="Role · email"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink-muted"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePersonRow(p.id)}
                      className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-black/[0.06] hover:text-ink"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={addPersonRow}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[12px] font-semibold text-accent hover:border-accent/50"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Add person
                </button>
              </li>
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
            <p className="text-[13px] font-semibold text-ink">Logistics</p>
          </div>
          <p className="mt-2 text-[13px] text-ink-muted">COI on file · Travel 11–16 Jun · Final timeline due 21 May</p>
          <button
            type="button"
            onClick={() => setTabAndUrl("travel")}
            className="mt-3 text-[12px] font-semibold text-accent hover:text-accent-hover"
          >
            Open travel
          </button>
        </div>
      </aside>

      <section className="flex h-[min(720px,calc(100dvh-10rem))] min-h-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-surface xl:h-[min(720px,calc(100dvh-11rem))]">
        <header className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {tabBtn("timeline", "Timeline")}
            {tabBtn("thread", "By thread")}
            {tabBtn("tasks", "Tasks")}
            {tabBtn("files", "Files")}
            {tabBtn("financials", "Financials")}
            {tabBtn("travel", "Travel")}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "timeline" ? (
            <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(250,251,252,1)_0%,rgba(244,246,249,1)_100%)]">
              <div className="shrink-0 space-y-2 border-b border-border/60 bg-surface/80 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-ink">{activeThread?.title ?? "Thread"}</p>
                  {activeThread?.participantHint ? (
                    <p className="mt-0.5 text-[11px] text-ink-faint">{activeThread.participantHint}</p>
                  ) : null}
                </div>
                {threads.length > 1 ? (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {threads.map((t) => {
                      const on = t.id === activeThread?.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedThreadId(t.id)}
                          className={
                            "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                            (on ? "bg-ink text-canvas" : "bg-canvas text-ink-muted hover:bg-black/[0.04]")
                          }
                        >
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                <div className="w-full space-y-2">
                  {activeThread
                    ? earlierMessages.map((msg) => {
                        const fk = messageFoldKey(activeThread.id, msg.id);
                        return (
                          <FoldableTimelineMessage
                            key={fk}
                            msg={msg}
                            expanded={messageExpanded[fk] ?? defaultExpandedForMessage(msg)}
                            onToggle={() => toggleMessage(fk)}
                          />
                        );
                      })
                    : null}

                  {todayMessages.length > 0 ? (
                    <div className="flex justify-center py-0.5">
                      <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        Today
                      </span>
                    </div>
                  ) : null}

                  {activeThread
                    ? todayMessages.map((msg) => {
                        const fk = messageFoldKey(activeThread.id, msg.id);
                        return (
                          <FoldableTimelineMessage
                            key={fk}
                            msg={msg}
                            expanded={messageExpanded[fk] ?? defaultExpandedForMessage(msg)}
                            onToggle={() => toggleMessage(fk)}
                          />
                        );
                      })
                    : null}

                  {showDraft ? (
                    <div className="relative w-full rounded-lg bg-accent/[0.06]">
                      {/* Pixel-based rect (no viewBox stretch) so rx matches rounded-lg (~8px) */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="100%"
                        height="100%"
                        className="pointer-events-none absolute inset-0 text-accent"
                        aria-hidden
                      >
                        <rect
                          x="1"
                          y="1"
                          width="calc(100% - 2px)"
                          height="calc(100% - 2px)"
                          rx={7}
                          ry={7}
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity={0.55}
                          strokeWidth={1.5}
                          className="pending-draft-border-dash"
                        />
                      </svg>
                      <button
                        type="button"
                        onClick={() => setDraftExpanded((e) => !e)}
                        aria-expanded={draftExpanded}
                        className="relative z-[1] flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.02]"
                      >
                        <ChevronDown
                          className={"mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition " + (draftExpanded ? "rotate-180" : "")}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar text-[10px] font-bold text-white" aria-hidden>
                          ED
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-ink">You</span>
                            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">Pending approval</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-ink-faint">Draft · not sent yet</p>
                          {!draftExpanded ? (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{DRAFT_DEFAULT}</p>
                          ) : null}
                        </div>
                      </button>
                      {draftExpanded ? (
                        <div className="relative z-[1] border-t border-border/60 px-3 pb-3 pt-0 sm:pl-[3.25rem]">
                          <p className="pt-2 text-[13px] leading-relaxed text-ink">{DRAFT_DEFAULT}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent-hover"
                              onClick={(e) => {
                                e.stopPropagation();
                                approveDraft();
                              }}
                            >
                              Approve & send
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition hover:border-accent/40 hover:text-ink"
                              onClick={(e) => {
                                e.stopPropagation();
                                editDraftInComposer();
                              }}
                            >
                              Edit in reply box
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="w-full rounded-lg border border-dashed border-border bg-surface/80 px-3 py-2 text-center text-[12px] text-ink-muted">
                      No pending drafts for this thread. Use the reply box below.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {tab !== "timeline" ? (
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {tab === "thread" ? (
            <div className="space-y-4">
              {threads.map((t) => {
                const count = getMessagesForThread(t.id).length;
                return (
                  <div key={t.id}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.participantHint}</p>
                    <div className="mt-2 space-y-3 rounded-2xl border border-border bg-canvas/60 p-4 text-[13px] text-ink-muted">
                      <p className="font-semibold text-ink">{t.title}</p>
                      <p>
                        {count} message{count === 1 ? "" : "s"} · last activity {t.lastActivityLabel}
                      </p>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-accent transition hover:border-accent/40 hover:text-accent-hover"
                        onClick={() => {
                          setSelectedThreadId(t.id);
                          setTabAndUrl("timeline");
                        }}
                      >
                        Open in timeline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === "tasks" ? (
            <ul className="space-y-2 text-[13px]">
              <li className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
                <span>Send 6-week questionnaire</span>
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
                <input type="checkbox" className="h-4 w-4 accent-accent" />
                <span>Confirm final floor plan PDF from planner</span>
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
                <input type="checkbox" className="h-4 w-4 accent-accent" />
                <span>Upload COI to venue portal</span>
              </li>
            </ul>
          ) : null}

          {tab === "files" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
                <Paperclip className="h-4 w-4 text-ink-faint" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">timeline_v3.pdf</p>
                  <p className="text-[12px] text-ink-faint">248 KB · from planner</p>
                </div>
              </div>
              <button type="button" className="text-[12px] font-semibold text-accent hover:text-accent-hover" onClick={() => showToast("Upload dialog would open here (demo).")}>
                + Add file
              </button>
            </div>
          ) : null}

          {tab === "financials" ? (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-muted">Proposals, contracts, and invoices for this wedding.</p>
              <WeddingFinancialsPanel weddingId={weddingId} />
            </div>
          ) : null}

          {tab === "travel" ? (
            <div className="space-y-5">
              {travelPlan ? (
                <TravelTabPanel travelPlan={travelPlan} onToast={showToast} />
              ) : (
                <p className="text-[13px] text-ink-muted">No travel plan for this wedding (demo).</p>
              )}
            </div>
          ) : null}
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border bg-surface px-3 py-2 sm:px-4">
          <div className="mb-1.5 flex min-h-[1.5rem] flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className="min-w-0 flex-1 truncate text-[10px] leading-tight text-ink-faint sm:text-[11px]"
              title={
                replyMeta.toAddr
                  ? `${replyMeta.toAddr} · ${replyMeta.subjectLine}${replyScope === "replyAll" ? " · Cc (demo)" : ""}`
                  : `${replyMeta.subjectLine} — add recipients under People`
              }
            >
              {replyMeta.toAddr ? (
                <>
                  <span className="font-medium text-ink-muted">To</span> {replyMeta.toAddr}
                  <span className="text-ink-faint"> · </span>
                </>
              ) : (
                <span className="text-ink-faint">No recipient yet — </span>
              )}
              <span className="text-ink-muted">{replyMeta.subjectLine}</span>
              {replyScope === "replyAll" && replyMeta.toAddr ? (
                <span className="text-ink-faint"> · Cc +2</span>
              ) : null}
            </p>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => applyReplyScope("reply")}
                title="Reply to sender only"
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition sm:text-[11px] " +
                  (replyScope === "reply"
                    ? "bg-ink text-canvas"
                    : "border border-border bg-canvas text-ink-muted hover:border-accent/30")
                }
              >
                <Reply className="h-3 w-3" strokeWidth={2} aria-hidden />
                Reply
              </button>
              <button
                type="button"
                onClick={() => applyReplyScope("replyAll")}
                title="Reply all (demo: adds couple on Cc)"
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition sm:text-[11px] " +
                  (replyScope === "replyAll"
                    ? "bg-ink text-canvas"
                    : "border border-border bg-canvas text-ink-muted hover:border-accent/30")
                }
              >
                <ReplyAll className="h-3 w-3" strokeWidth={2} aria-hidden />
                All
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="wedding-inline-reply">
            Write a reply
          </label>
          <textarea
            id="wedding-inline-reply"
            ref={replyAreaRef}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-snug text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              title="Submits draft for approval when required"
              className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-accent-hover sm:text-[12px]"
              onClick={submitInlineForApproval}
            >
              Submit
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-canvas px-2.5 text-ink transition hover:border-accent/40"
              onClick={() => showToast("Attachment picker (demo).")}
              title="Attach file"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink sm:text-[12px]"
              title="Studio-only note"
              onClick={() => openComposer("internal")}
            >
              Note
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-canvas sm:text-[12px]"
              title="Draft a reply with AI (demo)"
              onClick={generateInlineResponse}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              Generate response
            </button>
          </div>
        </footer>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Story so far</p>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{w.story}</p>
          <button type="button" disabled={summaryBusy} className="mt-4 text-[12px] font-semibold text-accent hover:text-accent-hover disabled:opacity-50" onClick={regenerateSummary}>
            {summaryBusy ? "Regenerating…" : "Regenerate summary"}
          </button>
          <div className="mt-5 border-t border-border pt-4">
            <label htmlFor="photographer-wedding-notes" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              My notes
            </label>
            <textarea
              id="photographer-wedding-notes"
              value={photographerNotes}
              onChange={(e) => setPhotographerNotes(e.target.value)}
              rows={5}
              placeholder="Private notes for your studio — not shared with clients."
              className="mt-2 w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">Saved automatically in this browser.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Attachments</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
            <Paperclip className="h-4 w-4 text-ink-faint" />
            <div>
              <p className="text-[13px] font-semibold text-ink">timeline_v3.pdf</p>
              <p className="text-[12px] text-ink-faint">248 KB</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-canvas/70 p-4 text-[13px] text-ink-muted">
          <p className="font-semibold text-ink">Other weddings</p>
          <p className="mt-2">Jump between projects without losing context.</p>
          <div className="mt-3 flex flex-col gap-2 text-[13px] font-semibold text-accent">
            <Link to="/wedding/santorini" className="hover:text-accent-hover">Amelia & James</Link>
            <Link to="/wedding/london" className="hover:text-accent-hover">Priya & Daniel</Link>
          </div>
        </div>
      </aside>

      {composerOpen ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/35 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Composer">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 ring-1 ring-black/[0.08]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{composerKind === "internal" ? "Internal note" : "Email composer"}</p>
                <p className="mt-1 text-[15px] font-semibold text-ink">{weddingFields.couple}</p>
              </div>
              <button type="button" className="rounded-full p-2 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close composer" onClick={() => setComposerOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {composerKind === "reply" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-[12px] font-semibold text-ink-muted">
                  To
                  <input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink" />
                </label>
                <label className="block text-[12px] font-semibold text-ink-muted">
                  Cc <span className="font-normal text-ink-faint">(optional)</span>
                  <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="assistant@studio.com" className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink" />
                </label>
                <label className="block text-[12px] font-semibold text-ink-muted">
                  Subject
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink" />
                </label>
                <label className="block text-[12px] font-semibold text-ink-muted">
                  Message
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1 w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-4 py-2 text-[13px] font-semibold text-ink hover:border-accent/40" onClick={requestAiDraft}>
                    <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
                    Request AI draft
                  </button>
                  <button type="button" className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-4 py-2 text-[13px] font-semibold text-ink hover:border-accent/40" onClick={() => showToast("Attachment picker (demo).")}>
                    <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                    Attach file
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  <button type="button" className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="rounded-full bg-accent px-5 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover" onClick={sendComposer}>
                    Submit for approval
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-[13px] text-ink-muted">Visible only to your studio — never emailed to clients.</p>
                <textarea value={internalBody} onChange={(e) => setInternalBody(e.target.value)} rows={6} placeholder="e.g. Call planner about second shooter add-on…" className="w-full resize-y rounded-xl border border-blush/50 bg-blush/10 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint" />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-canvas" onClick={sendComposer}>
                    Save note
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WeddingDetailPage() {
  const { weddingId } = useParams();
  const entry = weddingId ? resolveWeddingEntry(weddingId) : null;
  if (!weddingId || !entry) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-[15px] font-semibold text-ink">Wedding not found</p>
        <p className="max-w-md text-center text-[13px] text-ink-muted">This project doesn’t exist or was removed.</p>
        <Link to="/weddings" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
          ← Back to Weddings
        </Link>
      </div>
    );
  }
  return <WeddingDetailInner weddingId={weddingId} entry={entry} />;
}
