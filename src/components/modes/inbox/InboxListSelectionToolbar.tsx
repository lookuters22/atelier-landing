import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import { deriveStarredFromGmailLabelIds, deriveUnreadFromGmailLabelIds } from "../../../lib/gmailInboxLabels";

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
    <div className="inbox-list-sel-toolbar">
      <div className="inbox-list-sel-toolbar-left">
        <div className={`cb${listEmpty ? " inbox-list-sel-cb-disabled" : ""}`}>
          <input
            ref={checkboxRef}
            type="checkbox"
            disabled={listEmpty}
            checked={allSelected}
            onChange={onCheckboxChange}
            aria-label={allSelected ? "Deselect all" : "Select all"}
          />
        </div>
        <select
          className="inbox-bulk-select"
          aria-label="Restrict selection"
          disabled={listEmpty}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            e.target.value = "";
            if (!v || listEmpty) return;
            if (v === "all") selectIds(visibleThreads.map((t) => t.id));
            else if (v === "none") selectIds([]);
            else if (v === "read") applyFilter((t) => !threadIsUnread(t));
            else if (v === "unread") applyFilter((t) => threadIsUnread(t));
            else if (v === "starred") applyFilter((t) => threadIsStarred(t));
            else if (v === "unstarred") applyFilter((t) => !threadIsStarred(t));
          }}
        >
          <option value="">Selection…</option>
          <option value="all">All</option>
          <option value="none">None</option>
          <option value="read">Read</option>
          <option value="unread">Unread</option>
          <option value="starred">Starred</option>
          <option value="unstarred">Unstarred</option>
        </select>
        <button
          type="button"
          className="act inbox-list-sel-icon"
          aria-label="Refresh list"
          disabled={refreshing || bulkDeleting}
          onClick={() => void onRefresh()}
        >
          {refreshing ? <Loader2 className="inbox-list-sel-spin" strokeWidth={2} aria-hidden /> : <RefreshCw className="inbox-list-sel-ico" strokeWidth={2} aria-hidden />}
        </button>
        {showDelete ? (
          <button
            type="button"
            className="act inbox-list-sel-icon inbox-list-sel-del"
            aria-label={selectionCount === 1 ? "Delete selected message" : `Delete ${selectionCount} selected messages`}
            disabled={bulkDeleting}
            onClick={onDeleteSelected}
          >
            {bulkDeleting ? <Loader2 className="inbox-list-sel-spin" strokeWidth={2} aria-hidden /> : <Trash2 className="inbox-list-sel-ico" strokeWidth={2} aria-hidden />}
          </button>
        ) : null}
      </div>
      <span className="inbox-list-sel-count">{countLabel}</span>
    </div>
  );
}
