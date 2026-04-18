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
import { SelectorFocusRow, type SelectorFocusRowSize } from "./SelectorFocusRow";
import type { SelectorFocusListItem } from "./SelectorFocusList";

/**
 * Editorial 3-column selector layout for dense taxonomies (Step 3 —
 * Offerings & Deliverables).
 *
 * Uses CSS multi-column layout (`columns-*`) so category blocks flow
 * naturally top-to-bottom within each column like a magazine spread.
 * Each category block (`break-inside-avoid`) stays intact across column
 * breaks. Rows share the same `.selector-focus-list` / `:has()` styling
 * as `SelectorFocusList`, so the "visual focus" (dim-others-to-0.3)
 * behavior is unified across the whole step.
 */
export type SelectorFocusColumnsCategory = {
  id: string;
  title: ReactNode;
  items: readonly SelectorFocusListItem[];
};

export type SelectorFocusColumnsProps = {
  categories: readonly SelectorFocusColumnsCategory[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  size?: SelectorFocusRowSize;
  stagger?: boolean;
  /** Tailwind column count classes. Defaults to 1 / 2 / 3 responsive. */
  columnsClassName?: string;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  trailingSlot?: ReactNode;
};

function toggleMulti(prev: readonly string[], id: string): string[] {
  return prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
}

export function SelectorFocusColumns({
  categories,
  value,
  onChange,
  size = "sm",
  stagger = true,
  columnsClassName = "columns-1 sm:columns-2 lg:columns-3",
  className,
  ariaLabel,
  ariaLabelledBy,
  trailingSlot,
}: SelectorFocusColumnsProps): JSX.Element {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const flatIds = useMemo(
    () => categories.flatMap((c) => c.items.filter((i) => !i.disabled).map((i) => i.id)),
    [categories],
  );

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
      const idx = flatIds.indexOf(currentId);
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

  const handleToggle = useCallback(
    (id: string) => onChange(toggleMulti(value, id)),
    [value, onChange],
  );

  let staggerCursor = 0;
  return (
    <div
      ref={containerRef}
      role="group"
      aria-multiselectable
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKeyDown}
      className={cn(
        "selector-focus-list w-full",
        columnsClassName,
        "gap-x-10 lg:gap-x-14",
        className,
      )}
    >
      {categories.map((category) => (
        <section
          key={category.id}
          aria-label={typeof category.title === "string" ? category.title : undefined}
          className="mb-9 break-inside-avoid"
        >
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
            {category.title}
          </p>
          <div className="flex flex-col gap-y-3.5">
            {category.items.map((item) => {
              const selected = selectedSet.has(item.id);
              const delayIndex = staggerCursor++;
              const row = (
                <SelectorFocusRow
                  id={item.id}
                  label={item.label}
                  description={item.description}
                  size={size}
                  disabled={item.disabled}
                  selected={selected}
                  onToggle={() => handleToggle(item.id)}
                  role="checkbox"
                />
              );
              if (reduceMotion || !stagger) {
                return <div key={item.id}>{row}</div>;
              }
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.32,
                    ease: [0.22, 1, 0.36, 1],
                    delay: Math.min(delayIndex * 0.018, 0.45),
                  }}
                >
                  {row}
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}
      {trailingSlot ? (
        <div className="break-inside-avoid pt-1">{trailingSlot}</div>
      ) : null}
    </div>
  );
}
