import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { SelectorFocusRow } from "@/components/onboarding/selectors";
import type { OfferComponentType } from "@/lib/onboardingBusinessScopeDeterministic";
import type {
  OfferGroup,
  OfferGroupId,
} from "@/lib/onboardingOfferComponentGroups";

/**
 * Step 3 — Offerings & Deliverables — rendered as a **vertical accordion
 * menu** (per the "clean & calm" redesign).
 *
 * UX model:
 *   - The operator lands on a short, scannable list of top-level categories
 *     (e.g. "Photo deliverables", "Video deliverables", "Cross-service
 *     add-ons"). Just the headings — no bento, no gradients, no icons.
 *   - Each category row shows the label, a one-line description, and a
 *     "selected" count (always reserved line, fades in once > 0 so the
 *     header height never jumps).
 *   - Clicking a category expands its chip grid inline. **Only one
 *     category is open at a time** — when the operator opens one, the
 *     other categories collapse out of view so the open category floats
 *     to the top of the stage. Clicking the open category again (or
 *     collapsing it) restores the full list.
 *   - The chip grid inside each category uses
 *     `SelectorFocusRow variant="chip"` (pure text with a hover-only
 *     underline sweep and a text-only selected state).
 *
 * The set of visible groups is driven by the operator's Step 1 core_services
 * selection (see `getVisibleOfferGroups`) so this component accepts them
 * pre-filtered.
 */
export type OfferingsBentoProps = {
  groups: readonly OfferGroup[];
  value: readonly OfferComponentType[];
  onChange: (next: OfferComponentType[]) => void;
  labelFor: (id: OfferComponentType) => string;
  /** Rendered below the accordion (e.g. "Add your own" inline field). */
  trailingSlot?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

/**
 * Per-row entrance choreography.
 *
 * Entrance: blur-8 → 0, opacity 0 → 1, y 14 → 0. Feels like ink
 * developing on a page — matches the editorial tone. The blur filter is
 * skipped when `prefers-reduced-motion` is set.
 *
 * Staggering is done via a per-index `transition.delay` on each child
 * (not `staggerChildren` on the container) so this animation composes
 * cleanly with the always-mounted "hide sibling rows" choreography used
 * for the single-open accordion behaviour.
 */
const ROW_ENTRANCE_DELAY_BASE = 0.1;
const ROW_ENTRANCE_DELAY_STEP = 0.09;
const ROW_ENTRANCE_DURATION = 0.62;
const ROW_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Collapsed state for a sibling row while some *other* category is open.
 * Collapses height + vertical spacing to 0 so the open category actually
 * rises to the top of the stage instead of sitting in a dead gap.
 */
const ROW_HIDDEN_STYLE = {
  opacity: 0,
  y: -6,
  height: 0,
  marginTop: 0,
  marginBottom: 0,
  paddingTop: 0,
  paddingBottom: 0,
  filter: "blur(4px)",
} as const;

const EXPAND_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};

function countAllItems(group: OfferGroup): number {
  let n = 0;
  for (const sub of group.subsections) n += sub.items.length;
  return n;
}

function countSelectedIn(
  group: OfferGroup,
  selected: ReadonlySet<OfferComponentType>,
): number {
  let n = 0;
  for (const sub of group.subsections) {
    for (const id of sub.items) if (selected.has(id)) n += 1;
  }
  return n;
}

/**
 * How many sub-columns to tile a category's subsections into when the
 * category is expanded. Matches the old bento rhythm: photo/video
 * split 2-up (their subsections are tall), others get 3-up if they
 * have enough subsections.
 */
function subsectionColsClass(groupId: OfferGroupId, subCount: number): string {
  if (groupId === "photo" || groupId === "video") {
    return subCount >= 2 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1";
  }
  if (subCount >= 3) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  if (subCount === 2) return "grid-cols-1 md:grid-cols-2";
  return "grid-cols-1";
}

type CategoryRowProps = {
  group: OfferGroup;
  open: boolean;
  onToggleOpen: () => void;
  selectedCount: number;
  totalCount: number;
  selectedSet: ReadonlySet<OfferComponentType>;
  onToggleItem: (id: OfferComponentType) => void;
  labelFor: (id: OfferComponentType) => string;
};

/**
 * Animation replayed on the label each time the user taps / activates the
 * header. A brief glow + scale pulse on the uppercase label reads as
 * "the system acknowledged your click" without yanking the whole row.
 */
const LABEL_PULSE_KEYFRAMES = {
  scale: [1, 1.035, 1],
  textShadow: [
    "0 0 0 rgba(255,255,255,0)",
    "0 0 22px rgba(255,255,255,0.32)",
    "0 0 0 rgba(255,255,255,0)",
  ],
};
const LABEL_PULSE_TRANSITION: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

function CategoryRow({
  group,
  open,
  onToggleOpen,
  selectedCount,
  totalCount,
  selectedSet,
  onToggleItem,
  labelFor,
}: CategoryRowProps): JSX.Element {
  const reduce = useReducedMotion();
  const subGridCols = subsectionColsClass(group.id, group.subsections.length);
  const panelId = `offerings-category-panel-${group.id}`;
  const buttonId = `offerings-category-button-${group.id}`;

  // Bumped every time the user taps the header — `motion.span key={pulseKey}`
  // remounts so the entrance animation (glow + tiny scale punch) replays
  // on every interaction rather than only the first.
  const [pulseKey, setPulseKey] = useState(0);
  const handleClick = useCallback(() => {
    setPulseKey((k) => k + 1);
    onToggleOpen();
  }, [onToggleOpen]);

  return (
    <section className="offerings-category">
      <motion.button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleClick}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        transition={{ duration: 0.18, ease: ROW_EASE }}
        className={cn(
          "group/cat relative flex w-full flex-col items-center gap-1.5 py-6 text-center outline-none",
          "transition-colors duration-300 ease-out motion-reduce:transition-none",
        )}
      >
        <motion.span
          key={reduce ? undefined : pulseKey}
          initial={false}
          animate={reduce ? undefined : LABEL_PULSE_KEYFRAMES}
          transition={LABEL_PULSE_TRANSITION}
          className={cn(
            "block text-[11px] font-semibold uppercase tracking-[0.24em]",
            "text-white/70 transition-colors duration-300",
            "group-hover/cat:text-white group-focus-visible/cat:text-white",
            open && "text-white",
          )}
          style={{ willChange: "transform, text-shadow" }}
        >
          {group.label}
        </motion.span>
        <span className="block text-[12.5px] leading-relaxed text-white/45">
          {group.description}
        </span>
        {/*
          Selected-count caption. Always rendered so the header keeps a
          stable height — toggling visibility via opacity instead of
          conditionally mounting prevents the category row (and anything
          below it) from jumping when the first item is selected.
        */}
        <span
          aria-hidden={selectedCount === 0 ? true : undefined}
          className={cn(
            "mt-1 block text-[10px] font-medium uppercase tracking-[0.22em] text-white/50",
            "transition-opacity duration-300 ease-out motion-reduce:transition-none",
            selectedCount === 0 && "pointer-events-none opacity-0",
          )}
        >
          {selectedCount > 0 ? (
            <>
              {selectedCount}
              <span className="text-white/30"> / {totalCount}</span>
              <span className="ml-1 text-white/30">selected</span>
            </>
          ) : (
            // Placeholder keeps the line height reserved; content is
            // visually hidden via opacity-0 above.
            <>
              0<span className="text-white/30"> / {totalCount}</span>
              <span className="ml-1 text-white/30">selected</span>
            </>
          )}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND_TRANSITION}
            style={{ overflow: "hidden" }}
          >
            {/*
              Chip grid. Each subsection becomes a column; items stack within.
              The `.selector-focus-list` wrapper keeps keyboard-nav scoping
              clean even though we disabled row-level dim for chips.
            */}
            <div
              className={cn(
                "selector-focus-list grid gap-x-8 gap-y-5 pb-6 pt-2",
                subGridCols,
              )}
            >
              {group.subsections.map((sub) => (
                <div key={sub.id} className="flex flex-col">
                  <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
                    {sub.title}
                  </p>
                  <div className="flex flex-col gap-y-1.5">
                    {sub.items.map((id) => (
                      <SelectorFocusRow
                        key={id}
                        id={id}
                        label={labelFor(id)}
                        size="sm"
                        variant="chip"
                        selected={selectedSet.has(id)}
                        onToggle={() => onToggleItem(id)}
                        role="checkbox"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function OfferingsBento({
  groups,
  value,
  onChange,
  labelFor,
  trailingSlot,
  ariaLabel,
  className,
}: OfferingsBentoProps): JSX.Element {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(value), [value]);

  // Single-open accordion: at most one category is expanded at any time.
  // When a category is open, the other categories are collapsed out of
  // view so the open category rises to the top of the stage.
  //
  // Initial default: if exactly ONE group already has selections, open it
  // so the operator lands on the context they last touched. Otherwise
  // start fully collapsed — surfacing one of many would hide the others
  // unexpectedly.
  const [openId, setOpenId] = useState<OfferGroupId | null>(() => {
    const withSelections = groups.filter(
      (g) => countSelectedIn(g, selectedSet) > 0,
    );
    return withSelections.length === 1 ? withSelections[0].id : null;
  });

  const toggleOpen = useCallback((id: OfferGroupId) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  // Flat list of chip ids in render order — used for keyboard nav scoping.
  // Only the currently open category contributes rows (its siblings are
  // collapsed to height 0 so their chips aren't rendered to screen).
  const flatIds = useMemo(() => {
    if (openId === null) return [];
    const group = groups.find((g) => g.id === openId);
    if (!group) return [];
    const ids: OfferComponentType[] = [];
    for (const sub of group.subsections) {
      for (const id of sub.items) ids.push(id);
    }
    return ids;
  }, [groups, openId]);

  const focusRowAt = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container || flatIds.length === 0) return;
      const safe = ((index % flatIds.length) + flatIds.length) % flatIds.length;
      const targetId = flatIds[safe];
      if (!targetId) return;
      const el = container.querySelector<HTMLButtonElement>(
        `[data-selector-focus-id="${CSS.escape(targetId)}"]`,
      );
      el?.focus();
    },
    [flatIds],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const currentId = target?.getAttribute("data-selector-focus-id");
      if (!currentId) return;
      const idx = flatIds.indexOf(currentId as OfferComponentType);
      if (idx < 0) return;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          focusRowAt(idx + 1);
          return;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          focusRowAt(idx - 1);
          return;
        case "Home":
          e.preventDefault();
          focusRowAt(0);
          return;
        case "End":
          e.preventDefault();
          focusRowAt(flatIds.length - 1);
          return;
        default:
          return;
      }
    },
    [flatIds, focusRowAt],
  );

  const handleToggleItem = useCallback(
    (id: OfferComponentType) => {
      const next = selectedSet.has(id)
        ? value.filter((v) => v !== id)
        : [...value, id];
      onChange(next);
    },
    [value, selectedSet, onChange],
  );

  const rootClassName = cn("offerings-bento w-full", className);

  if (reduce) {
    // Reduced-motion path: all groups always rendered, no filters. When a
    // category is open, siblings are hidden via `display: none` to match
    // the single-open behaviour used by the motion path — just without
    // any animation.
    return (
      <div
        ref={containerRef}
        role="group"
        aria-multiselectable
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={rootClassName}
      >
        {groups.map((group) => {
          const isHidden = openId !== null && openId !== group.id;
          return (
            <div key={group.id} style={isHidden ? { display: "none" } : undefined}>
              <CategoryRow
                group={group}
                open={openId === group.id}
                onToggleOpen={() => toggleOpen(group.id)}
                selectedCount={countSelectedIn(group, selectedSet)}
                totalCount={countAllItems(group)}
                selectedSet={selectedSet}
                onToggleItem={handleToggleItem}
                labelFor={labelFor}
              />
            </div>
          );
        })}
        {trailingSlot ? <div className="pt-6">{trailingSlot}</div> : null}
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      role="group"
      aria-multiselectable
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={rootClassName}
    >
      {/*
        All category rows are ALWAYS mounted. Visibility + collapse is
        driven by each row's `animate` target so there's no mount /
        unmount cycle to desync and no way for any one row (e.g. the
        Photo group) to get stuck in a stale measured state after a
        toggle sequence.

          - `openId === null`  → every row animates into its shown state
                                 with a staggered per-index delay
                                 (blur-in, fade-up, y → 0).
          - `openId === group` → that row stays shown; all siblings
                                 animate to collapsed (height 0, faded,
                                 slight blur-out).
      */}
      {groups.map((group, index) => {
        const isOpen = openId === group.id;
        const isHidden = openId !== null && !isOpen;
        return (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={
              isHidden
                ? ROW_HIDDEN_STYLE
                : {
                    opacity: 1,
                    y: 0,
                    height: "auto",
                    marginTop: 0,
                    marginBottom: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    filter: "blur(0px)",
                  }
            }
            transition={
              isHidden
                ? { duration: 0.28, ease: ROW_EASE }
                : {
                    duration: ROW_ENTRANCE_DURATION,
                    ease: ROW_EASE,
                    delay:
                      ROW_ENTRANCE_DELAY_BASE + index * ROW_ENTRANCE_DELAY_STEP,
                  }
            }
            style={{ overflow: "hidden" }}
          >
            <CategoryRow
              group={group}
              open={isOpen}
              onToggleOpen={() => toggleOpen(group.id)}
              selectedCount={countSelectedIn(group, selectedSet)}
              totalCount={countAllItems(group)}
              selectedSet={selectedSet}
              onToggleItem={handleToggleItem}
              labelFor={labelFor}
            />
          </motion.div>
        );
      })}
      {trailingSlot ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: ROW_ENTRANCE_DURATION,
            ease: ROW_EASE,
            delay:
              ROW_ENTRANCE_DELAY_BASE +
              groups.length * ROW_ENTRANCE_DELAY_STEP,
          }}
          className="pt-6"
        >
          {trailingSlot}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
