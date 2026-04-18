import { forwardRef, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Onboarding selector primitive — a borderless, typographic row with a
 * simple circle indicator on the right.
 *
 * No card, no track, no switch. Just the label (+ optional tagline) and a
 * small clickable circle that fills with a soft sage glow when selected.
 * Clicking anywhere on the row toggles it, like a radio/checkbox with the
 * label extended across the whole row.
 *
 * Sizing:
 *   - "lg": serif label (Core services).
 *   - "md": sans label (Specializations, Offer components).
 *   - "sm": denser sans label.
 */
export type SelectorToggleRowSize = "sm" | "md" | "lg";

export type SelectorToggleRowProps = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  selected: boolean;
  onToggle: () => void;
  size?: SelectorToggleRowSize;
  disabled?: boolean;
  /** "checkbox" (default) for multi-select, "radio" when used in a `radiogroup`. */
  role?: "checkbox" | "radio";
  className?: string;
};

const LABEL_CLASSES: Record<SelectorToggleRowSize, string> = {
  sm: "text-[13.5px] font-medium leading-snug tracking-tight",
  md: "text-[14.5px] sm:text-[15px] font-medium leading-snug tracking-tight",
  lg: "font-serif text-[17px] sm:text-[18.5px] font-normal leading-[1.2] tracking-tight",
};

const DESCRIPTION_CLASSES: Record<SelectorToggleRowSize, string> = {
  sm: "mt-1 text-[11.5px] leading-relaxed tracking-[0.005em]",
  md: "mt-1 text-[12px] sm:text-[12.5px] leading-relaxed tracking-[0.005em]",
  lg: "mt-1.5 text-[12.5px] sm:text-[13px] leading-relaxed tracking-[0.005em]",
};

const ROW_PADDING: Record<SelectorToggleRowSize, string> = {
  sm: "py-2.5",
  md: "py-3",
  lg: "py-3.5",
};

function handleKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  onToggle: () => void,
): void {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    onToggle();
  }
}

export const SelectorToggleRow = forwardRef<
  HTMLButtonElement,
  SelectorToggleRowProps
>(function SelectorToggleRow(
  {
    id,
    label,
    description,
    selected,
    onToggle,
    size = "md",
    disabled,
    role = "checkbox",
    className,
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const ariaProps =
    role === "radio"
      ? ({ role: "radio", "aria-checked": selected } as const)
      : ({ role: "checkbox", "aria-checked": selected } as const);

  return (
    <button
      ref={ref}
      type="button"
      data-selector-choice-id={id}
      data-selected={selected ? "true" : "false"}
      {...ariaProps}
      aria-disabled={disabled ? true : undefined}
      disabled={disabled}
      onClick={onToggle}
      onKeyDown={(e) => handleKeyDown(e, onToggle)}
      className={cn(
        "group relative flex w-full items-center gap-4 border-0 bg-transparent px-3 text-left outline-none",
        "rounded-xl focus-visible:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-white/40",
        "transition-colors duration-300 ease-out motion-reduce:transition-none",
        ROW_PADDING[size],
        disabled && "pointer-events-none opacity-45",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <motion.span
          className={cn(
            "block text-balance",
            LABEL_CLASSES[size],
            "transition-colors duration-300 ease-out motion-reduce:transition-none",
            selected ? "text-white" : "text-white/55 group-hover:text-white/85",
          )}
          initial={false}
          animate={
            reduceMotion
              ? undefined
              : {
                  textShadow: selected
                    ? "0 0 16px rgba(156, 168, 147, 0.3)"
                    : "0 0 0 rgba(156, 168, 147, 0)",
                }
          }
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {label}
        </motion.span>
        {description ? (
          <span
            className={cn(
              "block text-balance",
              DESCRIPTION_CLASSES[size],
              "transition-colors duration-300 ease-out motion-reduce:transition-none",
              selected ? "text-white/72" : "text-white/52 group-hover:text-white/70",
            )}
          >
            {description}
          </span>
        ) : null}
      </div>

      {/* simple dot indicator — hairline empty circle when off, solid sage dot when on. */}
      {/* The inline `cornerShape: "round"` style overrides the global */}
      {/* `.font-dashboard [class*="rounded-"]` squircle rule by inline-style specificity, */}
      {/* so the dot, its glow halo, and its flare all render as true circles. */}
      <div className="shrink-0">
        <motion.span
          aria-hidden="true"
          className={cn(
            "relative block h-2.5 w-2.5 rounded-full border transition-[background-color,border-color] duration-300 ease-out",
            selected
              ? "border-[#9ca893] bg-[#9ca893]"
              : "border-white/25 bg-transparent group-hover:border-white/55",
          )}
          style={{ cornerShape: "round" } as React.CSSProperties}
          initial={false}
          animate={{
            boxShadow: selected
              ? "0 0 10px rgba(156, 168, 147, 0.5)"
              : "0 0 0 rgba(156, 168, 147, 0)",
            scale: reduceMotion ? 1 : selected ? [1, 1.18, 1] : 1,
          }}
          transition={{ duration: 0.36, ease: "easeOut" }}
        >
          {/* engine-on flare — quick pulse out of the dot when it flips on */}
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-5px] rounded-full bg-[#9ca893]"
            style={{ cornerShape: "round" } as React.CSSProperties}
            initial={false}
            animate={
              reduceMotion
                ? { opacity: 0 }
                : selected
                  ? { opacity: [0, 0.3, 0], scale: [0.8, 1.3, 1.7] }
                  : { opacity: 0, scale: 0.8 }
            }
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        </motion.span>
      </div>
    </button>
  );
});
