import {
  useCallback,
  useMemo,
  useRef,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  SelectorFocusRow,
  type SelectorFocusRowAlign,
  type SelectorFocusRowSize,
} from "./SelectorFocusRow";

/**
 * Editorial selector list — a vertical stack of `SelectorFocusRow`s.
 *
 * Pairs with `.selector-focus-list` CSS (see `src/index.css`) which uses
 * `:has()` to dim every non-selected / non-hovered / non-focused row to
 * opacity 0.3 as soon as any row in the list is selected or hovered. This
 * gives the Apple-editorial "visual focus" feel without any JS state.
 *
 * Provides the same public surface as `SelectorToggleList` so the scope step
 * can swap it in without changing call sites materially.
 */
export type SelectorFocusListItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type SelectorFocusListProps = {
  items: readonly SelectorFocusListItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  mode?: "multi" | "single";
  size?: SelectorFocusRowSize;
  stagger?: boolean;
  /** Vertical gap between rows. Defaults to `"lg"` (32px) per editorial spec. */
  rowGap?: "md" | "lg";
  /**
   * Content alignment for each row. `"start"` (default) keeps the dot in
   * a left gutter with left-aligned text; `"center"` pulls the dot inline
   * and centers the whole [dot + label] cluster. See `SelectorFocusRow`.
   */
  align?: SelectorFocusRowAlign;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  trailingSlot?: ReactNode;
};

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

const ROW_GAP_CLASS: Record<NonNullable<SelectorFocusListProps["rowGap"]>, string> = {
  md: "gap-y-5",
  lg: "gap-y-8",
};

export function SelectorFocusList({
  items,
  value,
  onChange,
  mode = "multi",
  size = "md",
  stagger = true,
  rowGap = "lg",
  align = "start",
  className,
  ariaLabel,
  ariaLabelledBy,
  trailingSlot,
}: SelectorFocusListProps): JSX.Element {
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

  const focusRowAt = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container || focusableIds.length === 0) return;
      const safe =
        ((index % focusableIds.length) + focusableIds.length) %
        focusableIds.length;
      const targetId = focusableIds[safe];
      if (!targetId) return;
      const candidates = container.querySelectorAll<HTMLButtonElement>(
        "[data-selector-focus-id]",
      );
      for (const el of Array.from(candidates)) {
        if (el.getAttribute("data-selector-focus-id") === targetId) {
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
      const currentId = target?.getAttribute("data-selector-focus-id");
      if (!currentId) return;
      const currentIndex = focusableIds.indexOf(currentId);
      if (currentIndex < 0) return;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          focusRowAt(currentIndex + 1);
          return;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          focusRowAt(currentIndex - 1);
          return;
        case "Home":
          e.preventDefault();
          focusRowAt(0);
          return;
        case "End":
          e.preventDefault();
          focusRowAt(focusableIds.length - 1);
          return;
        default:
          return;
      }
    },
    [focusRowAt, focusableIds],
  );

  const groupProps =
    mode === "single"
      ? ({ role: "radiogroup" } as const)
      : ({ role: "group", "aria-multiselectable": true } as const);

  return (
    <div
      ref={containerRef}
      {...groupProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKeyDown}
      className={cn(
        "selector-focus-list flex w-full flex-col",
        ROW_GAP_CLASS[rowGap],
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = selectedSet.has(item.id);
        const row = (
          <SelectorFocusRow
            id={item.id}
            label={item.label}
            description={item.description}
            size={size}
            align={align}
            disabled={item.disabled}
            selected={selected}
            onToggle={() => handleToggle(item.id)}
            role={mode === "single" ? "radio" : "checkbox"}
          />
        );
        if (reduceMotion || !stagger) {
          return <div key={item.id}>{row}</div>;
        }
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.58,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.08 + Math.min(index * 0.09, 0.6),
            }}
          >
            {row}
          </motion.div>
        );
      })}
      {trailingSlot ? <div className="pt-2">{trailingSlot}</div> : null}
    </div>
  );
}

export const __selectorFocusListInternals = { nextSelection };
