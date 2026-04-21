/**
 * Shared class strings extracted from Inbox left/right panes (source of truth).
 * Use via components in this folder; export for Link-as-child or rare composition.
 */

/** Ana shell: 4px control corners (inputs, ctx search) — see `src/index.css` tokens */
export const PANE_CONTROL_RADIUS = "rounded-[4px]";

/** Ana shell: 6px nav / compact chips */
export const PANE_NAV_RADIUS = "rounded-[6px]";

/** Inbox search field: icon 2.5 from left, pl-8, calm border + focus ring */
export const PANE_SEARCH_INPUT_FIELD =
  `w-full ${PANE_CONTROL_RADIUS} border border-border bg-background py-1.5 pl-8 pr-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring`;

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

/* --- Ana inbox slice: left rail + thread list (visual; shared with PaneNavRow / list tabs) --- */

/** Compose — 4px corners to match Ana HTML `.btn` / pane-head rhythm */
export const PANE_INBOX_COMPOSE =
  "flex w-full items-center justify-center gap-2 rounded-[4px] bg-foreground py-2.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90";

/** Raised search shell (matches `export/redesign` `.ctx .search`) */
export const PANE_INBOX_SEARCH_SHELL =
  "flex min-h-0 w-full items-center gap-2 rounded-[4px] border border-border bg-background px-2.5 py-2";

export const PANE_INBOX_SEARCH_INPUT_INNER =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0";

/** Section labels — mono uppercase like `.ctx-section-label` */
export const PANE_INBOX_SECTION_LABEL =
  "px-2.5 pb-1.5 pt-3 font-mono text-[10px] font-normal uppercase tracking-[0.11em] text-muted-foreground first:pt-0";

/** Collapsible section trigger — same family as section label */
export const PANE_INBOX_SECTION_TOGGLE =
  "mb-1 flex w-full items-center gap-1 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground";

/** Folder / ctx nav row — rectangular active chip (`.ctx-item`) */
export const PANE_INBOX_CTX_ROW_BASE =
  "flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[13px] tracking-tight transition-colors";

export const PANE_INBOX_CTX_ROW_ACTIVE = "bg-foreground font-medium text-background";

export const PANE_INBOX_CTX_ROW_INACTIVE =
  "text-foreground/90 hover:bg-black/[0.04] dark:text-foreground/85 dark:hover:bg-white/[0.06]";

export const PANE_INBOX_CTX_SUB_BASE =
  "flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-left text-[13px] transition-colors";

export const PANE_INBOX_CTX_SUB_ACTIVE = PANE_INBOX_CTX_ROW_ACTIVE;

export const PANE_INBOX_CTX_SUB_INACTIVE = PANE_INBOX_CTX_ROW_INACTIVE;

export const PANE_INBOX_CTX_NESTED_BASE =
  "min-w-0 flex-1 rounded-[4px] px-2.5 py-1 text-left text-[12px] transition-colors";

export const PANE_INBOX_CTX_NESTED_ACTIVE = "bg-foreground font-medium text-background";

export const PANE_INBOX_CTX_NESTED_INACTIVE =
  "text-foreground/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

export const PANE_INBOX_CTX_LABEL_BASE =
  "flex w-full items-center gap-2 rounded-[4px] px-2.5 py-[5px] text-left text-[13px] transition-colors";

export const PANE_INBOX_CTX_LABEL_ACTIVE = "bg-foreground font-medium text-background";

export const PANE_INBOX_CTX_LABEL_INACTIVE =
  "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.05]";

/** Count badge in pane title (`.pane-head .count`) */
export const PANE_INBOX_HEAD_COUNT =
  "rounded-[3px] border border-border px-1.5 py-0.5 font-mono text-[12px] tabular-nums font-normal text-muted-foreground";

/** End-of-row folder count — muted tabular */
export const PANE_INBOX_NAV_COUNT = "ml-auto font-mono text-[11px] tabular-nums text-muted-foreground";

export const PANE_INBOX_NAV_COUNT_ACTIVE = "ml-auto font-mono text-[11px] tabular-nums text-background/70";

/** List tabs bar (`.list-tabs`) */
export const PANE_INBOX_LIST_TAB_BAR =
  "inline-flex w-fit max-w-full items-center gap-0.5 rounded-[5px] border border-border bg-muted/50 p-0.5";

export const PANE_INBOX_LIST_TAB_ACTIVE =
  "rounded-[3px] bg-background px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-foreground shadow-sm";

export const PANE_INBOX_LIST_TAB_INACTIVE =
  "rounded-[3px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition hover:text-foreground";

/** List meta row (`.list-meta`) */
export const PANE_INBOX_LIST_META_ROW =
  "flex items-center justify-between gap-2 px-4 py-2 text-[12px] text-muted-foreground";

/* --- Slice 4: Inbox thread detail + inspector (Ana HTML `.thread` / `.inspector`) --- */

/** Matches `export/redesign` `.thread-head { padding: 22px 36px 18px }` */
export const PANE_INBOX_THREAD_HEAD = "shrink-0 border-b border-border px-9 pb-[18px] pt-[22px]";

export const PANE_INBOX_THREAD_BACK =
  "inline-flex w-fit items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.9px] text-[color:var(--color-ink-muted)] transition hover:text-[color:var(--color-ink)]";

export const PANE_INBOX_THREAD_TITLE =
  "mt-1 text-[28px] font-normal leading-[1.02] tracking-[-0.8px] text-[color:var(--color-ink)]";

/** `.thread-head .crumbs` gap 10px, 13px tertiary */
export const PANE_INBOX_THREAD_CRUMBS =
  "mt-2.5 flex flex-wrap items-center gap-[10px] text-[13px] tracking-[-0.1px] text-[color:var(--color-ink-muted)]";

/** `.chip-sm` mono 10px, uppercase, tracking 0.8px, pad 3px 7px */
export const PANE_INBOX_THREAD_CHIP =
  "rounded-[3px] border border-[color:var(--color-border)] px-[7px] py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.8px] text-[color:var(--color-ink-muted)]";

/** `.chip-sm.book` */
export const PANE_INBOX_THREAD_CHIP_BOOK =
  "rounded-[3px] border border-[rgba(11,180,70,0.25)] bg-[rgba(11,223,80,0.08)] px-[7px] py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.8px] text-[#0a7a2f] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

/** `.t-action` — 12px, radius 4px, raised surface */
export const PANE_INBOX_T_ACTION =
  "inline-flex items-center gap-1.5 rounded-[4px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink-muted)] transition hover:bg-black/[0.04] hover:text-[color:var(--color-ink)] dark:bg-[color:var(--color-card)] dark:hover:bg-white/[0.06]";

/** `.thread-body` pad 24px 36px 120px, max 760 centered in inner */
export const PANE_INBOX_THREAD_BODY_WRAP =
  "min-h-0 flex-1 overflow-y-auto px-9 pb-[120px] pt-6";

export const PANE_INBOX_THREAD_BODY_INNER = "mx-auto w-full max-w-[760px]";

/** Message row — Ana `.msg` */
export const PANE_INBOX_MSG_ARTICLE = "border-b border-border last:border-b-0";

/** `.msg-head .ava` — 36px circle, semi-mono 13px (Ana Dashboard.html) */
export const PANE_INBOX_MSG_AVA =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground font-medium [font-family:var(--font-semi-mono)] text-[13px] text-background";

export const PANE_INBOX_MSG_AVA_YOU =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background font-medium [font-family:var(--font-semi-mono)] text-[13px] text-foreground";

/** `.msg p` — 15px / 1.6, fg-2 (#313130 in ana.css) */
export const PANE_INBOX_MSG_BODY_TEXT =
  "text-[15px] leading-[1.6] tracking-[-0.1px] text-[#313130] dark:text-foreground/90";

/** `.ana-draft` — margin 22px 0 4px; `radius-card` 8px; border `--color-fin`; raised surface */
export const PANE_INBOX_ANA_DRAFT =
  "relative mb-1 mt-[22px] overflow-hidden rounded-[8px] border border-[color:var(--color-fin)] bg-[color:var(--color-surface)]";

export const PANE_INBOX_ANA_DRAFT_SHIM =
  "pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(255,86,0,0.025)] to-transparent to-[30%]";

export const PANE_INBOX_ANA_DRAFT_HEAD =
  "flex items-center justify-between gap-3 border-b border-[rgba(255,86,0,0.15)] bg-[rgba(255,86,0,0.03)] px-4 py-3";

export const PANE_INBOX_ANA_DRAFT_BADGE =
  "flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--color-fin)]";

export const PANE_INBOX_ANA_DRAFT_BODY = "px-[18px] pb-1.5 pt-[18px]";

export const PANE_INBOX_ANA_DRAFT_FOOT =
  "flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3";

export const PANE_INBOX_BTN_SEND =
  "inline-flex items-center gap-1.5 rounded-[4px] bg-[color:var(--color-fin)] px-3.5 py-2 text-[13px] font-medium text-white transition hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const PANE_INBOX_BTN_GHOSTLINE =
  "inline-flex items-center gap-1.5 rounded-[4px] border border-border bg-transparent px-3 py-2 text-[13px] text-foreground transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]";

/** `.inspector-body` pad 20px 20px 120px, gap 20px column */
export const PANE_INBOX_INSPECTOR_SCROLL =
  "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 pb-[120px] text-[13px] text-[color:var(--color-ink)]";

export const PANE_INBOX_CARD =
  "rounded-[8px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4";

export const PANE_INBOX_CARD_LINKED =
  "rounded-[8px] border border-[rgba(11,223,80,0.25)] bg-[rgba(11,223,80,0.03)] p-4 dark:border-emerald-500/25 dark:bg-emerald-500/5";

export const PANE_INBOX_CARD_EYEBROW =
  "mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground";

export const PANE_INBOX_CARD_TITLE = "text-[14px] font-medium tracking-tight text-foreground";

export const PANE_INBOX_CARD_BODY = "text-[13px] leading-snug text-muted-foreground";

export const PANE_INBOX_OPEN_LINK =
  "mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-foreground";

export const PANE_INBOX_AUTO_SEG =
  "flex rounded-[5px] border border-border bg-muted/40 p-0.5";

export const PANE_INBOX_AUTO_SEG_BTN =
  "flex-1 rounded-[3px] px-1 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition";

export const PANE_INBOX_AUTO_SEG_BTN_ON =
  "bg-foreground font-medium text-background shadow-sm dark:bg-foreground";

export const PANE_INBOX_AI_CONF_BAR = "mt-1.5 h-[3px] overflow-hidden rounded-sm bg-black/[0.06] dark:bg-white/[0.08]";

export const PANE_INBOX_AI_REASON =
  "mt-2.5 text-[13px] leading-relaxed text-foreground/90 font-serif italic tracking-tight";

export const PANE_INBOX_KV_ROW = "grid grid-cols-[12px_1fr] gap-2.5 border-t border-border pt-3 first:border-t-0 first:pt-0";
