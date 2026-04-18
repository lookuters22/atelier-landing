import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import { deriveStarredFromGmailLabelIds, deriveUnreadFromGmailLabelIds } from "../../../lib/gmailInboxLabels";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { cn } from "@/lib/utils";

function threadIsUnread(t: UnfiledThread): boolean {
  return deriveUnreadFromGmailLabelIds(t.gmailLabelIds) ?? false;
}

function threadIsStarred(t: UnfiledThread): boolean {
  return deriveStarredFromGmailLabelIds(t.gmailLabelIds) ?? false;
}

export function InboxListSelectionToolbar({
  visibleThreads,
  selectedIds,
  setSelectedIds,
  onRefresh,
  refreshing,
  countLabel,
  onDeleteSelected,
  bulkDeleting,
}: {
  visibleThreads: UnfiledThread[];
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  countLabel: string;
  onDeleteSelected: () => void;
  bulkDeleting: boolean;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  const { allSelected, someSelected } = useMemo(() => {
    const allCount = visibleThreads.length;
    const selectedCount = visibleThreads.filter((t) => selectedIds.has(t.id)).length;
    const allSelected = allCount > 0 && selectedCount === allCount;
    const someSelected = selectedCount > 0 && !allSelected;
    return { allSelected, someSelected };
  }, [visibleThreads, selectedIds]);

  useEffect(() => {
    const el = checkboxRef.current;
    if (!el) return;
    el.indeterminate = someSelected;
  }, [someSelected]);

  const selectIds = (ids: Iterable<string>) => {
    setSelectedIds(new Set(ids));
  };

  const applyFilter = (predicate: (t: UnfiledThread) => boolean) => {
    selectIds(visibleThreads.filter(predicate).map((t) => t.id));
  };

  const onCheckboxChange = () => {
    if (allSelected) {
      selectIds([]);
    } else {
      selectIds(visibleThreads.map((t) => t.id));
    }
  };

  const listEmpty = visibleThreads.length === 0;
  const selectionCount = selectedIds.size;
  const showDelete = selectionCount > 0;

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5 sm:px-2.5">
      <div className="flex min-w-0 items-center gap-0.5">
        <div className={cn("inline-flex h-8 items-center gap-0", listEmpty && "opacity-50")}>
          <div className="flex shrink-0 items-center">
            <input
              ref={checkboxRef}
              type="checkbox"
              disabled={listEmpty}
              checked={allSelected}
              onChange={onCheckboxChange}
              className="h-3.5 w-3.5 rounded border-border"
              aria-label={allSelected ? "Deselect all" : "Select all"}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={listEmpty}
                className="h-8 w-8 shrink-0 text-muted-foreground"
                aria-label="Selection options"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem]">
              <DropdownMenuItem
                onSelect={() => selectIds(visibleThreads.map((t) => t.id))}
                disabled={listEmpty}
              >
                All
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => selectIds([])} disabled={listEmpty}>
                None
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => applyFilter((t) => !threadIsUnread(t))}
                disabled={listEmpty}
              >
                Read
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => applyFilter((t) => threadIsUnread(t))}
                disabled={listEmpty}
              >
                Unread
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => applyFilter((t) => threadIsStarred(t))}
                disabled={listEmpty}
              >
                Starred
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => applyFilter((t) => !threadIsStarred(t))}
                disabled={listEmpty}
              >
                Unstarred
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label="Refresh list"
          disabled={refreshing || bulkDeleting}
          onClick={() => void onRefresh()}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
          )}
        </Button>
        {showDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={selectionCount === 1 ? "Delete selected message" : `Delete ${selectionCount} selected messages`}
            disabled={bulkDeleting}
            onClick={onDeleteSelected}
          >
            {bulkDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Trash2 className="h-4 w-4" strokeWidth={2} />
            )}
          </Button>
        ) : null}
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{countLabel}</span>
    </div>
  );
}
