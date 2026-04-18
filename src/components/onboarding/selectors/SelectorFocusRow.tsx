import {
  forwardRef,
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Editorial selector row — no card, no border, no background.
 *
 * Design intent (pro/Apple-editorial):
 *   - Pure typography, left-aligned.
 *   - Selection indicator sits on the LEFT of the label as a minimalist 4px
 *     dot. Invisible when unselected, white when selected.
 *   - Active state: label becomes pure white and font-medium.
 *   - "Visual focus" behavior (dim sibling rows to 0.3) is owned by the parent
 *     `SelectorFocusList` / `SelectorFocusColumns` via `:has()` CSS on the
 *     shared `.selector-focus-list` container and this row's
 *     `data-selector-focus-id` / `data-selected` attributes.
 *
 * Sizing:
 *   - "lg": serif label — used for Step 1 (Core services).
 *   - "md": sans label — used for Step 2 (Specializations).
 *   - "sm": dense sans label — used for Step 3 (Offerings & Deliverables).
 */
export type SelectorFocusRowSize = "sm" | "md" | "lg";
/**
 * Selection-indicator style.
 *   - "dot"  — 4px white dot (used in Step 1 Core services, Step 2 Specializations).
 *   - "line" — 2px vertical line (used in Step 3 Offerings bento per spec).
 */
export type SelectorFocusRowIndicator = "dot" | "line";
/**
 * Visual variant of the row itself.
 *   - "row"  — borderless typography row with a left-gutter dot/line
 *              indicator. Used in Steps 1 & 2 where the layout is pure
 *              editorial text.
 *   - "chip" — text-only "editorial label" row (no background, no border,
 *              no left indicator). Hover/focus: label brightens to pure
 *              white, a thin underline draws then sweeps out, and a soft
 *              text-shadow glow eases in. Selected state is *text-only*
 *              — label stays bright + font-medium + glow, no underline,
 *              no side bar. Used in Step 3 Offerings.
 */
export type SelectorFocusRowVariant = "row" | "chip";

/**
 * Content alignment for the row.
 *   - "start"  (default) — dot indicator in a fixed left gutter, label
 *                          text-left next to it. Editorial "bullet list"
 *                          feel.
 *   - "center"           — dot + label flow together, centered in the
 *                          row. Unselected dot stays invisible but
 *                          reserves space so selected and unselected
 *                          rows stay visually aligned on the same
 *                          center axis. Description centers below.
 *                          Only applies to the "row" variant.
 */
export type SelectorFocusRowAlign = "start" | "center";

export type SelectorFocusRowProps = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  selected: boolean;
  onToggle: () => void;
  size?: SelectorFocusRowSize;
  indicator?: SelectorFocusRowIndicator;
  /** Visual variant. Defaults to "row". */
  variant?: SelectorFocusRowVariant;
  /** Content alignment. Defaults to "start". Ignored for the chip variant. */
  align?: SelectorFocusRowAlign;
  disabled?: boolean;
  /** "checkbox" (default) for multi-select, "radio" when in a radiogroup. */
  role?: "checkbox" | "radio";
  className?: string;
};

const LABEL_CLASSES: Record<SelectorFocusRowSize, string> = {
  sm: "text-[13.5px] leading-[1.35] tracking-tight",
  md: "text-[16px] sm:text-[16.5px] leading-[1.3] tracking-tight",
  lg: "font-serif text-[clamp(1.3rem,2.6vw,1.65rem)] leading-[1.12] tracking-tight",
};

const DOT_OFFSET: Record<SelectorFocusRowSize, string> = {
  sm: "mt-[0.52em]",
  md: "mt-[0.55em]",
  lg: "mt-[0.58em]",
};

// Vertical bar height — roughly cap-height so it reads as a typographic
// "cursor" aligned to the first line of the label.
const LINE_HEIGHT_BY_SIZE: Record<SelectorFocusRowSize, string> = {
  sm: "h-[11px] mt-[0.25em]",
  md: "h-[13px] mt-[0.25em]",
  lg: "h-[17px] mt-[0.28em]",
};

function handleKey(event: KeyboardEvent<HTMLButtonElement>, toggle: () => void): void {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    toggle();
  }
}

/**
 * Click-pulse keyframes replayed on the label each time the operator
 * toggles a row (mouse / keyboard / tap). A subtle scale punch plus a
 * soft text-shadow glow that rises and settles — reads as "the system
 * saw your input" without being loud.
 */
const LABEL_PULSE_KEYFRAMES = {
  scale: [1, 1.03, 1],
  textShadow: [
    "0 0 0 rgba(255,255,255,0)",
    "0 0 22px rgba(255,255,255,0.3)",
    "0 0 0 rgba(255,255,255,0)",
  ],
};
const LABEL_PULSE_TRANSITION: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

export const SelectorFocusRow = forwardRef<HTMLButtonElement, SelectorFocusRowProps>(
  function SelectorFocusRow(
    {
      id,
      label,
      description,
      selected,
      onToggle,
      size = "md",
      indicator = "dot",
      variant = "row",
      align = "start",
      disabled,
      role = "checkbox",
      className,
    },
    ref,
  ) {
    const ariaProps =
      role === "radio"
        ? ({ role: "radio", "aria-checked": selected } as const)
        : ({ role: "checkbox", "aria-checked": selected } as const);

    const isChip = variant === "chip";
    // "center" alignment only makes sense for the editorial row variant;
    // the chip variant has its own centered text-fx model already.
    const isCentered = !isChip && align === "center";
    const reduce = useReducedMotion();

    // Bumped every activation so the label's `motion.span key={pulseKey}`
    // remounts and replays the glow + scale keyframes. Chip variant opts
    // out because it already has its own hover / selected micro-fx.
    const [pulseKey, setPulseKey] = useState(0);
    const handleClick = useCallback(() => {
      if (!isChip) setPulseKey((k) => k + 1);
      onToggle();
    }, [isChip, onToggle]);
    const handleKeyWithPulse = useCallback(
      (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!isChip) setPulseKey((k) => k + 1);
          onToggle();
          return;
        }
        handleKey(e, onToggle);
      },
      [isChip, onToggle],
    );

    return (
      <motion.button
        ref={ref}
        type="button"
        data-selector-focus-id={id}
        data-selected={selected ? "true" : "false"}
        data-variant={variant}
        data-align={isCentered ? "center" : "start"}
        {...ariaProps}
        aria-disabled={disabled ? true : undefined}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyWithPulse}
        whileTap={reduce || isChip ? undefined : { scale: 0.985 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "selector-focus-row group/row relative flex w-full outline-none",
          isChip
            ? [
                // Editorial "text-fx" label — NO background, NO border, NO
                // left indicator. Hover draws a transient underline +
                // glow; selected state is text-only (brighter + medium +
                // glow). No persistent underline, no side bar.
                "items-center border-0 bg-transparent px-0 py-2 text-left",
                "text-white/55 transition-colors duration-300 ease-out motion-reduce:transition-none",
                "hover:text-white focus-visible:text-white",
                "data-[selected=true]:text-white",
              ]
            : isCentered
              ? [
                  // Centered editorial row: dot + label flow as a single
                  // centered cluster; description wraps centered below.
                  "flex-col items-center gap-1 border-0 bg-transparent px-0 py-0 text-center",
                  "text-white/55 transition-colors duration-300 ease-out motion-reduce:transition-none",
                  "hover:text-white focus-visible:text-white",
                  "data-[selected=true]:text-white",
                ]
              : [
                  "items-start gap-3 border-0 bg-transparent px-0 py-0 text-left",
                  "text-white/55 transition-colors duration-300 ease-out motion-reduce:transition-none",
                  "hover:text-white focus-visible:text-white",
                  "data-[selected=true]:text-white",
                ],
          disabled && "pointer-events-none opacity-40",
          className,
        )}
      >
        {isChip ? (
          // CHIP VARIANT — text-only editorial label.
          <span className="min-w-0 flex-1">
            <span className="relative inline-block max-w-full align-baseline">
              <span
                className={cn(
                  LABEL_CLASSES[size],
                  "group-data-[selected=true]/row:font-medium",
                  "transition-[text-shadow] duration-300 ease-out motion-reduce:transition-none",
                  "group-hover/row:[text-shadow:0_0_24px_rgba(255,255,255,0.16)]",
                  "group-focus-visible/row:[text-shadow:0_0_24px_rgba(255,255,255,0.16)]",
                  "group-data-[selected=true]/row:[text-shadow:0_0_22px_rgba(255,255,255,0.14)]",
                )}
              >
                {label}
              </span>
              <span
                aria-hidden="true"
                className="chip-underline pointer-events-none absolute inset-x-0 -bottom-1 block h-px bg-white/80"
              />
            </span>
          </span>
        ) : isCentered ? (
          // CENTERED ROW — dot indicator sits inline, immediately before
          // the label, and the whole [dot + label] group centers inside
          // the row. The dot keeps its fixed 4px slot (via `w-1` on the
          // inner span and `gap-2.5` on the wrapping flex), so unselected
          // rows reserve the same horizontal footprint as selected rows
          // and the text doesn't jitter between states.
          <>
            <span className="flex items-center justify-center gap-2.5">
              <span aria-hidden="true" className="flex flex-none items-center">
                <span
                  className={cn(
                    "selector-focus-indicator block h-1 w-1 rounded-full bg-white",
                    "transition-opacity duration-300 ease-out motion-reduce:transition-none",
                  )}
                  style={{ cornerShape: "round" } as React.CSSProperties}
                />
              </span>
              <motion.span
                key={reduce ? undefined : pulseKey}
                initial={false}
                animate={reduce ? undefined : LABEL_PULSE_KEYFRAMES}
                transition={LABEL_PULSE_TRANSITION}
                className={cn(
                  "text-balance",
                  LABEL_CLASSES[size],
                  "group-data-[selected=true]/row:font-medium",
                )}
                style={{ willChange: "transform, text-shadow" }}
              >
                {label}
              </motion.span>
            </span>
            {description ? (
              <span className="mt-0.5 block max-w-[46ch] text-pretty text-center text-[12.5px] leading-relaxed tracking-[0.005em] text-white/42 group-data-[selected=true]/row:text-white/72">
                {description}
              </span>
            ) : null}
          </>
        ) : (
          // DEFAULT LEFT-ALIGNED ROW — dot/line indicator in a fixed left
          // gutter, label column takes the remaining width.
          <>
            <span
              aria-hidden="true"
              className={cn(
                "flex-none",
                indicator === "line" ? "flex items-start" : "",
                indicator === "line" ? LINE_HEIGHT_BY_SIZE[size] : DOT_OFFSET[size],
              )}
            >
              {indicator === "line" ? (
                <span
                  className={cn(
                    "selector-focus-indicator block h-full w-[2px] bg-white",
                    "transition-opacity duration-300 ease-out motion-reduce:transition-none",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "selector-focus-indicator block h-1 w-1 rounded-full bg-white",
                    "transition-opacity duration-300 ease-out motion-reduce:transition-none",
                  )}
                  style={{ cornerShape: "round" } as React.CSSProperties}
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <motion.span
                key={reduce ? undefined : pulseKey}
                initial={false}
                animate={reduce ? undefined : LABEL_PULSE_KEYFRAMES}
                transition={LABEL_PULSE_TRANSITION}
                className={cn(
                  "block text-balance",
                  LABEL_CLASSES[size],
                  "group-data-[selected=true]/row:font-medium",
                )}
                style={{ willChange: "transform, text-shadow" }}
              >
                {label}
              </motion.span>
              {description ? (
                <span className="mt-1 block text-pretty text-[12.5px] leading-relaxed tracking-[0.005em] text-white/42 group-data-[selected=true]/row:text-white/72">
                  {description}
                </span>
              ) : null}
            </span>
          </>
        )}
      </motion.button>
    );
  },
);
