import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  SelectorChoiceCard,
  type SelectorChoiceCardAccent,
  type SelectorChoiceCardSize,
} from "./SelectorChoiceCard";

/**
 * Onboarding selector primitive — a responsive grid of `SelectorChoiceCard`s.
 *
 * Handles:
 *   - single vs multi-select semantics (mode)
 *   - arrow-key focus movement, Home/End jumps, Space/Enter toggle
 *   - tasteful staggered entrance (respects `prefers-reduced-motion`)
 *   - role/aria wiring (`radiogroup` vs `group` + `aria-multiselectable`)
 *
 * Everything visual lives in `SelectorChoiceCard`; this component is the
 * interaction shell.
 */
export type SelectorChoiceGridItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  accent?: SelectorChoiceCardAccent;
  disabled?: boolean;
};

export type SelectorChoiceGridProps = {
  items: readonly SelectorChoiceGridItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  mode?: "multi" | "single";
  size?: SelectorChoiceCardSize;
  /**
   * Optional responsive column hint. Default layout:
   *   - 1 column on very narrow screens,
   *   - 2 columns on `sm`,
   *   - 3 columns on `md`/`lg` for `size="md"|"sm"`,
   *   - 2 columns on `md`/`lg` for `size="lg"` (hero cards).
   *
   * Pass a number to force a specific column count on `md+`.
   */
  columns?: number;
  stagger?: boolean;
  className?: string;
  /** Optional accessible label for screen readers (`aria-label`). */
  ariaLabel?: string;
  /** Optional id of a visible heading (`aria-labelledby`). */
  ariaLabelledBy?: string;
  /** Slot rendered after the last card (used for `SelectorInlineAddOwn`). */
  trailingSlot?: ReactNode;
};

function pickGridTemplate(
  size: SelectorChoiceCardSize,
  columns: number | undefined,
): string {
  if (columns && columns > 0) {
    return cn(
      "grid gap-3",
      "grid-cols-1",
      columns >= 2 && "sm:grid-cols-2",
      columns >= 3 && "md:grid-cols-3",
      columns >= 4 && "lg:grid-cols-4",
    );
  }
  if (size === "lg") {
    return "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5";
  }
  return "grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 sm:gap-3";
}

function nextSelection(
  prev: readonly string[],
  id: string,
  mode: "multi" | "single",
): string[] {
  if (mode === "single") {
    return prev.length === 1 && prev[0] === id ? [] : [id];
  }
  return prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
}

export function SelectorChoiceGrid({
  items,
  value,
  onChange,
  mode = "multi",
  size = "md",
  columns,
  stagger = true,
  className,
  ariaLabel,
  ariaLabelledBy,
  trailingSlot,
}: SelectorChoiceGridProps): JSX.Element {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const handleToggle = useCallback(
    (id: string) => {
      onChange(nextSelection(value, id, mode));
    },
    [value, mode, onChange],
  );

  const focusableIds = useMemo(
    () => items.filter((i) => !i.disabled).map((i) => i.id),
    [items],
  );

  const focusCardAt = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;
      if (focusableIds.length === 0) return;
      const safeIndex =
        ((index % focusableIds.length) + focusableIds.length) %
        focusableIds.length;
      const targetId = focusableIds[safeIndex];
      if (!targetId) return;
      // Lookup-by-attribute without CSS.escape — ids come from our typed enum
      // union (no spaces / quotes), and we also keep this safe in jsdom where
      // `CSS.escape` is not implemented.
      const candidates = container.querySelectorAll<HTMLButtonElement>(
        "[data-selector-choice-id]",
      );
      for (const el of Array.from(candidates)) {
        if (el.getAttribute("data-selector-choice-id") === targetId) {
          el.focus();
          return;
        }
      }
    },
    [focusableIds],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const currentId = target?.getAttribute("data-selector-choice-id");
      if (!currentId) return;
      const currentIndex = focusableIds.indexOf(currentId);
      if (currentIndex < 0) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown": {
          e.preventDefault();
          focusCardAt(currentIndex + 1);
          return;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          e.preventDefault();
          focusCardAt(currentIndex - 1);
          return;
        }
        case "Home": {
          e.preventDefault();
          focusCardAt(0);
          return;
        }
        case "End": {
          e.preventDefault();
          focusCardAt(focusableIds.length - 1);
          return;
        }
        default:
          return;
      }
    },
    [focusCardAt, focusableIds],
  );

  const groupProps =
    mode === "single"
      ? ({ role: "radiogroup" } as const)
      : ({ role: "group", "aria-multiselectable": true } as const);

  const entrance =
    stagger && !reduceMotion
      ? {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.24, ease: "easeOut" as const },
        }
      : undefined;

  return (
    <div
      ref={containerRef}
      {...groupProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKeyDown}
      className={cn(pickGridTemplate(size, columns), className)}
    >
      <AnimatePresence initial>
        {items.map((item, index) => {
          const selected = selectedSet.has(item.id);
          if (reduceMotion || !stagger) {
            return (
              <SelectorChoiceCard
                key={item.id}
                id={item.id}
                label={item.label}
                description={item.description}
                accent={item.accent}
                size={size}
                disabled={item.disabled}
                selected={selected}
                onToggle={() => handleToggle(item.id)}
                role={mode === "single" ? "radio" : "checkbox"}
              />
            );
          }
          return (
            <motion.div
              key={item.id}
              {...entrance}
              transition={{
                duration: 0.24,
                ease: "easeOut",
                delay: Math.min(index * 0.04, 0.24),
              }}
            >
              <SelectorChoiceCard
                id={item.id}
                label={item.label}
                description={item.description}
                accent={item.accent}
                size={size}
                disabled={item.disabled}
                selected={selected}
                onToggle={() => handleToggle(item.id)}
                role={mode === "single" ? "radio" : "checkbox"}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {trailingSlot}
    </div>
  );
}

// Exposed for unit tests — keeps selection semantics verifiable without a DOM.
export const __selectorChoiceGridInternals = { nextSelection };
