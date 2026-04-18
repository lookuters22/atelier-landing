import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  SelectorToggleRow,
  type SelectorToggleRowSize,
} from "./SelectorToggleRow";

/**
 * Onboarding selector primitive — a vertical stack of `SelectorToggleRow`s.
 *
 * No containers, no cards. Just rows, a hairline between each, and a switch
 * per row. Handles single vs multi-select, Up/Down arrow navigation, Home/End
 * jumps, Space/Enter toggle, `radiogroup` vs `group + aria-multiselectable`,
 * and a soft staggered fade-in entrance (respects `prefers-reduced-motion`).
 */
export type SelectorToggleListItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type SelectorToggleListProps = {
  items: readonly SelectorToggleListItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  mode?: "multi" | "single";
  size?: SelectorToggleRowSize;
  stagger?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  /** Rendered below the last row (used for `SelectorInlineAddOwn`). */
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

export function SelectorToggleList({
  items,
  value,
  onChange,
  mode = "multi",
  size = "md",
  stagger = true,
  className,
  ariaLabel,
  ariaLabelledBy,
  trailingSlot,
}: SelectorToggleListProps): JSX.Element {
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
        case "ArrowDown":
        case "ArrowRight": {
          e.preventDefault();
          focusRowAt(currentIndex + 1);
          return;
        }
        case "ArrowUp":
        case "ArrowLeft": {
          e.preventDefault();
          focusRowAt(currentIndex - 1);
          return;
        }
        case "Home": {
          e.preventDefault();
          focusRowAt(0);
          return;
        }
        case "End": {
          e.preventDefault();
          focusRowAt(focusableIds.length - 1);
          return;
        }
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
        "flex w-full flex-col divide-y divide-white/[0.08]",
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = selectedSet.has(item.id);
        const row = (
          <SelectorToggleRow
            id={item.id}
            label={item.label}
            description={item.description}
            size={size}
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
              delay: Math.min(index * 0.05, 0.35),
            }}
          >
            {row}
          </motion.div>
        );
      })}
      {trailingSlot ? (
        <div className="border-t border-white/[0.06]">{trailingSlot}</div>
      ) : null}
    </div>
  );
}

// Exposed for unit tests — same semantics as the grid.
export const __selectorToggleListInternals = { nextSelection };
