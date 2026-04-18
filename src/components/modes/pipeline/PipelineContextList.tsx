import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ContextPaneRoot,
  PaneCountBadge,
  PaneHeaderStrip,
  PaneScrollRegion,
  PaneSearchInput,
  PaneSecondaryActionLink,
  PANE_INSPECTOR_STATUS_PILL,
  PANE_LEFT_LIST_CARD_TITLE,
  PANE_SCROLL_HELPER,
  PANE_SCROLL_HELPER_PAD,
  PANE_SECTION_COLLAPSIBLE_TRIGGER,
} from "@/components/panes";
import {
  Collapsible,
  CollapsibleTrigger,
  AnimatedCollapsibleContent,
} from "@/components/ui/collapsible";
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
import { usePipelineMode } from "./PipelineModeContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

function stageBadgeClass(stage: string): string {
  if (INQUIRY_STAGES.has(stage)) {
    return "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100";
  }
  if (ACTIVE_STAGES.has(stage)) {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (DELIVERABLE_STAGES.has(stage)) {
    return "border-violet-200/80 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-100";
  }
  if (stage === "archived") {
    return "border-border bg-muted/60 text-muted-foreground";
  }
  return "border-border bg-background text-foreground";
}

type Bucket = "inquiries" | "active" | "deliverables" | "archived";

const BUCKET_ORDER: Bucket[] = ["inquiries", "active", "deliverables", "archived"];

function bucketForStage(stage: string): Bucket {
  if (INQUIRY_STAGES.has(stage)) return "inquiries";
  if (ACTIVE_STAGES.has(stage)) return "active";
  if (DELIVERABLE_STAGES.has(stage)) return "deliverables";
  if (stage === "archived") return "archived";
  return "inquiries";
}

export function PipelineContextList() {
  const { photographerId } = useAuth();
  const { data: weddings, isLoading, error, deleteWedding } = useWeddings(photographerId ?? "");
  const { weddingId, selectWedding } = usePipelineMode();
  const [query, setQuery] = useState("");
  const listScrollRef = useRef<HTMLDivElement>(null);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteWedding(id);
    if (weddingId === id) selectWedding(null as unknown as string);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return weddings;
    return weddings.filter((w) => w.couple_names.toLowerCase().includes(q));
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

  // Same order as sidebar sections: inquiries -> active -> deliverables -> archived.
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

  const sections: { id: Bucket; title: string }[] = [
    { id: "inquiries", title: "Inquiries" },
    { id: "active", title: "Active Bookings" },
    { id: "deliverables", title: "Deliverables" },
    { id: "archived", title: "Archived" },
  ];

  return (
    <ContextPaneRoot>
      <PaneHeaderStrip>
        <PaneSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search couples…"
          aria-label="Search couples"
        />
        <PaneSecondaryActionLink to="/weddings/new" icon={Plus}>
          Add wedding
        </PaneSecondaryActionLink>
      </PaneHeaderStrip>

      <PaneScrollRegion ref={listScrollRef}>
        {isLoading && (
          <p className={cn(PANE_SCROLL_HELPER_PAD, PANE_SCROLL_HELPER)}>Loading weddings...</p>
        )}
        {error && (
          <p className={cn(PANE_SCROLL_HELPER_PAD, "text-[12px] text-destructive")}>Error: {error}</p>
        )}
        {!isLoading && !error && (
          <div className="space-y-1">
            {sections.map(({ id, title }) => (
              <Collapsible key={id} defaultOpen>
                <CollapsibleTrigger className={PANE_SECTION_COLLAPSIBLE_TRIGGER}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{title}</span>
                    <PaneCountBadge>{buckets[id].length}</PaneCountBadge>
                  </span>
                  <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground">
                    <ChevronRight
                      className="absolute h-3.5 w-3.5 group-data-[state=open]:hidden"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <ChevronDown
                      className="absolute hidden h-3.5 w-3.5 group-data-[state=open]:block"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </span>
                </CollapsibleTrigger>
                <AnimatedCollapsibleContent>
                  <div className="mt-0.5 space-y-0.5 pb-2">
                    {id === "archived" && buckets[id].length === 0 ? (
                      <p className={cn(PANE_SCROLL_HELPER_PAD, PANE_SCROLL_HELPER)}>
                        No archived weddings yet.
                      </p>
                    ) : (
                      buckets[id].map((w) => {
                        const selected = weddingId === w.id;
                        return (
                          <ContextMenu key={w.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                data-pipeline-wedding-row={w.id}
                                onClick={() => selectWedding(w.id)}
                                className={cn(
                                  "box-border flex w-full flex-col gap-1 rounded-2xl border border-transparent px-3 py-2 text-left transition-colors",
                                  "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                                  selected && "bg-foreground/10",
                                )}
                              >
                                <span className={PANE_LEFT_LIST_CARD_TITLE}>{w.couple_names}</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex max-w-full truncate rounded-full border px-1.5 py-0.5",
                                      PANE_INSPECTOR_STATUS_PILL,
                                      stageBadgeClass(w.stage),
                                    )}
                                  >
                                    {formatStageLabel(w.stage)}
                                  </span>
                                  <span className={PANE_SCROLL_HELPER}>{formatWeddingPipelineShortDate(w)}</span>
                                </div>
                              </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => selectWedding(w.id)}>
                                <ExternalLink className="mr-1.5 h-3 w-3" />
                                Open project
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                variant="destructive"
                                onClick={() => handleDelete(w.id, w.couple_names)}
                              >
                                <Trash2 className="mr-1.5 h-3 w-3" />
                                Delete project
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })
                    )}
                  </div>
                </AnimatedCollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </PaneScrollRegion>
    </ContextPaneRoot>
  );
}
