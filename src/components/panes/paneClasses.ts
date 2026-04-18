/**
 * Shared class strings extracted from Inbox left/right panes (source of truth).
 * Use via components in this folder; export for Link-as-child or rare composition.
 */

/** Inbox search field: icon 2.5 from left, pl-8, calm border + focus ring */
export const PANE_SEARCH_INPUT_FIELD =
  "w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/** Compose — primary CTA in left pane header */
export const PANE_PRIMARY_ACTION =
  "flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-[13px] font-semibold text-background shadow-sm transition hover:opacity-90";

/** Secondary / outline CTA (e.g. Add wedding) — same height & radius family as Compose */
export const PANE_SECONDARY_ACTION =
  "flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-[13px] font-medium text-foreground shadow-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

/** Static section title: INQUIRIES, LABELS, … */
export const PANE_SECTION_LABEL =
  "mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Collapsible section control (chevron + label) */
export const PANE_SECTION_TOGGLE =
  "mb-1 flex w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Radix CollapsibleTrigger: title + inline count on the left, chevron on the right.
 * Use `group` + ChevronRight (closed) / ChevronDown (open) like PaneSectionToggle — no extra hover panel.
 */
export const PANE_SECTION_COLLAPSIBLE_TRIGGER =
  "group mb-1 flex w-full items-center justify-between gap-0 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Default folder / nav row (inactive) */
export const PANE_NAV_ROW_BASE =
  "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] transition-colors";

export const PANE_NAV_ROW_ACTIVE = "bg-foreground/10 font-medium text-foreground";

export const PANE_NAV_ROW_INACTIVE =
  "text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

/** Secondary list row — full width (e.g. “All inquiries”) */
export const PANE_NAV_ROW_SUB_BASE =
  "flex w-full items-center rounded-full px-3 py-2 text-left text-[13px] transition-colors";

/** Nested row inside li — shares row with external link */
export const PANE_NAV_ROW_NESTED_BASE =
  "min-w-0 flex-1 rounded-full px-3 py-1.5 text-left text-[12px] transition-colors";

export const PANE_NAV_ROW_SUB_ACTIVE = "bg-foreground/10 font-medium text-foreground";

export const PANE_NAV_ROW_SUB_INACTIVE =
  "text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

export const PANE_NAV_ROW_NESTED_ACTIVE = "bg-foreground/10 font-medium text-foreground";

export const PANE_NAV_ROW_NESTED_INACTIVE =
  "text-foreground/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

/** Count at end of nav row (Inbox folder counts) */
export const PANE_COUNT_BADGE = "text-[11px] tabular-nums text-muted-foreground";

/** Left-pane loading / empty / helper lines (Inbox: “Loading…”, list empties) */
export const PANE_SCROLL_HELPER = "text-[12px] text-muted-foreground";

/** Tighter helper under collapsibles (Inbox Gmail labels area) */
export const PANE_SCROLL_HELPER_COMPACT = "text-[11px] leading-snug text-muted-foreground";

/** Standard horizontal padding for helper lines — matches Inbox section body */
export const PANE_SCROLL_HELPER_PAD = "px-3 py-2";

/** Shorter vertical rhythm for one-line empties */
export const PANE_SCROLL_HELPER_PAD_TIGHT = "px-3 py-1";

/** Primary headline in right inspector (Inbox CrmState couple name) */
export const PANE_INSPECTOR_TITLE = "text-[15px] font-semibold text-foreground";

/** Role / kind under title (Invoice, subtitle) */
export const PANE_INSPECTOR_SUBTITLE = "text-[13px] text-muted-foreground";

/** Default body / value line in inspector */
export const PANE_INSPECTOR_BODY = "text-[13px] text-foreground";

/** Muted descriptive copy (Inbox AI Suggestion, Quiet card intro) */
export const PANE_INSPECTOR_SECONDARY = "text-[12px] leading-relaxed text-muted-foreground";

/** Compact inspector lines (invoice line items, linker lists) — 12px base; set color on children */
export const PANE_INSPECTOR_COMPACT_LINE = "text-[12px]";

/**
 * Uppercase meta label — same style as PaneInspectorSectionTitle without margin.
 * Use for inline field labels (Event Date, Note) in inspector blocks.
 */
export const PANE_INSPECTOR_META_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Section title in inspector — includes bottom margin */
export const PANE_INSPECTOR_SECTION_TITLE = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Empty-state message under icon (PaneInspectorEmptyState) */
export const PANE_INSPECTOR_EMPTY_MESSAGE = "text-[12px] leading-relaxed text-muted-foreground";

/** Accent link in inspector key rows (Inbox pipeline links) */
export const PANE_INSPECTOR_ACCENT_LINK = "font-medium text-[#2563eb] hover:underline";

/** Small badge / pill label (directory tags, status chips) */
export const PANE_INSPECTOR_BADGE_LABEL = "text-[11px] font-medium";

/** Status / stage pill text (Inbox CRM badge) */
export const PANE_INSPECTOR_STATUS_PILL = "text-[11px] font-medium capitalize";

/** Primary line on multi-row list cards (Pipeline wedding rows) — 13px like nav */
export const PANE_LEFT_LIST_CARD_TITLE = "text-[13px] font-medium leading-tight text-foreground";

/** Gmail-style label rows — tighter horizontal padding */
export const PANE_NAV_ROW_LABEL_BASE =
  "flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left text-[12px] transition-colors";

export const PANE_NAV_ROW_LABEL_ACTIVE = "bg-foreground/10 font-medium";

export const PANE_NAV_ROW_LABEL_INACTIVE = "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

/** Right pane: scrollable body rhythm (Inbox inspector) */
export const PANE_INSPECTOR_SCROLL_BODY = "min-h-0 flex-1 space-y-5 overflow-y-auto p-4";

/** Quiet bordered block inside inspector */
export const PANE_QUIET_CARD = "rounded-lg border border-border bg-background px-3 py-3";

/** Idle inspector list row (Workspace cashflow, Calendar agenda) — muted card chrome */
export const PANE_INSPECTOR_IDLE_LIST_CARD =
  "rounded-lg border border-border/60 bg-muted/10 p-3";
