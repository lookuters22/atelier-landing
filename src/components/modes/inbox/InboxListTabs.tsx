import type { InboxListTab } from "../../../lib/inboxVisibleThreads";

const TABS: { id: InboxListTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "needs_reply", label: "Needs reply" },
];

export function InboxListTabs({
  listTab,
  onChange,
  disabled,
  counts,
}: {
  listTab: InboxListTab;
  onChange: (t: InboxListTab) => void;
  disabled?: boolean;
  counts: { all: number; unread: number; needs_reply: number };
}) {
  const nFor = (id: InboxListTab) => (id === "all" ? counts.all : id === "unread" ? counts.unread : counts.needs_reply);

  return (
    <div className="list-tabs" role="tablist" aria-label="Inbox list filters">
      {TABS.map((tab) => {
        const selected = listTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            data-active={selected ? "true" : "false"}
            onClick={() => onChange(tab.id)}
            className="list-tab"
          >
            {tab.label} <span className="n">{nFor(tab.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
