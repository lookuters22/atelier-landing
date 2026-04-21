import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAuth } from "@/context/AuthContext";
import { useWeddings } from "@/hooks/useWeddings";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
} from "@/lib/pipelineWeddingListNavigation";
import { formatWeddingPipelineShortDate } from "@/lib/weddingDateDisplay";
import { projectTypeBadgeLabel } from "@/lib/projectTypeDisplay";
import { usePipelineMode } from "./PipelineModeContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

function formatStageLabel(stage: string | null | undefined): string {
  const s = stage ?? "";
  return s ? s.replace(/_/g, " ") : "—";
}

function stageChipClass(bucket: Bucket): "inquiry" | "active" | "deliver" | "archived" {
  if (bucket === "inquiries") return "inquiry";
  if (bucket === "active") return "active";
  if (bucket === "deliverables") return "deliver";
  return "archived";
}

type Bucket = "inquiries" | "active" | "deliverables" | "archived";

const BUCKET_ORDER: Bucket[] = ["inquiries", "active", "deliverables", "archived"];

function bucketForStage(stage: string | null | undefined): Bucket {
  if (stage == null || stage === "") return "inquiries";
  if (INQUIRY_STAGES.has(stage)) return "inquiries";
  if (ACTIVE_STAGES.has(stage)) return "active";
  if (DELIVERABLE_STAGES.has(stage)) return "deliverables";
  if (stage === "archived") return "archived";
  return "inquiries";
}

const BUCKET_TITLE: Record<Bucket, string> = {
  inquiries: "Inquiries",
  active: "Active bookings",
  deliverables: "Deliverables",
  archived: "Archived",
};

export function PipelineContextList() {
  const { photographerId } = useAuth();
  const { data: weddings, isLoading, error, deleteWedding } = useWeddings(photographerId ?? "");
  const { weddingId, selectWedding } = usePipelineMode();
  const [query, setQuery] = useState("");
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<Bucket, boolean>>({
    inquiries: false,
    active: false,
    deliverables: false,
    archived: true,
  });

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteWedding(id);
    if (weddingId === id) selectWedding(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return weddings;
    return weddings.filter((w) => {
      const name = (w.couple_names ?? "").toLowerCase();
      const typeLbl = (projectTypeBadgeLabel(w.project_type) ?? "").toLowerCase();
      return name.includes(q) || typeLbl.includes(q);
    });
  }, [weddings, query]);

  const buckets = useMemo(() => {
    const out: Record<Bucket, typeof weddings> = {
      inquiries: [],
      active: [],
      deliverables: [],
      archived: [],
    };
    for (const w of filtered) {
      out[bucketForStage(w.stage)].push(w);
    }
    return out;
  }, [filtered]);

  const orderedWeddingIds = useMemo(() => {
    const ids: string[] = [];
    for (const b of BUCKET_ORDER) {
      for (const w of buckets[b]) {
        ids.push(w.id);
      }
    }
    return ids;
  }, [buckets]);

  useEffect(() => {
    if (orderedWeddingIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedWeddingIds, weddingId, delta);
      if (!id || id === weddingId) return;
      e.preventDefault();
      e.stopPropagation();
      selectWedding(id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedWeddingIds, weddingId, selectWedding]);

  useLayoutEffect(() => {
    if (!weddingId) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-pipeline-wedding-row="${CSS.escape(weddingId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    scrollPipelineWeddingRowIntoView(el, root);
  }, [weddingId]);

  useEffect(() => {
    function onKey(e: GlobalEventHandlersEventMap["keydown"]) {
      if (!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== "k") return;
      const t = e.target;
      if (isEditableKeyboardTarget(t)) return;
      e.preventDefault();
      const input = listScrollRef.current?.querySelector<HTMLInputElement>(
        'input[data-pipeline-search="1"]',
      );
      input?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pane ctx flex min-h-0 flex-1 flex-col overflow-hidden border-0">
        <div className="pane-head">
          <h3>
            Pipeline{" "}
            <button type="button" className="count">
              {weddings.length}
            </button>
          </h3>
          <label className="search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              data-pipeline-search="1"
              placeholder="Search projects, names, type…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              aria-label="Search projects by name or type"
            />
            <span className="kbd">⌘K</span>
          </label>
        </div>

        <nav ref={listScrollRef} className="ctx-nav" style={{ paddingTop: 4 }}>
          {isLoading && (
            <p className="px-3 py-4 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-4)]">
              Loading projects…
            </p>
          )}
          {error && (
            <p className="px-3 py-2 font-[family-name:var(--font-sans)] text-[12px] text-[var(--color-report-red)]">
              {error}
            </p>
          )}
          {!isLoading &&
            !error &&
            BUCKET_ORDER.map((bucket) => {
              const rows = buckets[bucket];
              const isCollapsed = collapsed[bucket];
              return (
                <div key={bucket}>
                  <button
                    type="button"
                    className="wed-group"
                    data-collapsed={isCollapsed ? "true" : "false"}
                    onClick={() => setCollapsed((c) => ({ ...c, [bucket]: !c[bucket] }))}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span>{BUCKET_TITLE[bucket]}</span>
                    <span className="gc">{rows.length}</span>
                  </button>
                  {!isCollapsed ? (
                    <div className="wed-group-body">
                      {bucket === "archived" && rows.length === 0 ? (
                        <p className="px-2 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-4)]">
                          No archived projects yet.
                        </p>
                      ) : (
                        rows.map((w) => {
                          const selected = weddingId === w.id;
                          const chipClass = stageChipClass(bucket);
                          const typeChip = projectTypeBadgeLabel(w.project_type);
                          return (
                            <ContextMenu key={w.id}>
                              <ContextMenuTrigger asChild>
                                <button
                                  type="button"
                                  data-pipeline-wedding-row={w.id}
                                  data-active={selected ? "true" : undefined}
                                  onClick={() => selectWedding(w.id)}
                                  className="wed-row"
                                >
                                  <div className="couple">{w.couple_names}</div>
                                  <div className="meta-line">
                                    <span className={cn("stage-chip", chipClass)}>{formatStageLabel(w.stage)}</span>
                                    {typeChip ? (
                                      <span
                                        className={cn("stage-chip", "archived")}
                                        data-project-type-chip="1"
                                        title="Project type"
                                      >
                                        {typeChip}
                                      </span>
                                    ) : null}
                                    <span>{formatWeddingPipelineShortDate(w)}</span>
                                  </div>
                                </button>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => selectWedding(w.id)}>
                                  <ExternalLink className="mr-1.5 h-3 w-3" />
                                  Open project
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem variant="destructive" onClick={() => handleDelete(w.id, w.couple_names)}>
                                  <Trash2 className="mr-1.5 h-3 w-3" />
                                  Delete project
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </nav>
      </div>
    </div>
  );
}
