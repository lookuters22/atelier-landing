import { forwardRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Onboarding selector primitive — a single tile.
 *
 * The visual language mirrors the existing briefing glass tokens
 * (see `scopeSectorGlassPillBase` / `scopeSectorGlassPillOn` in
 * `SectorDonutBubbleField.tsx`). Cards are flat — no physics, no drift,
 * no drag — they're just tappable/focusable tiles.
 *
 * Sizing:
 *   - "lg": hero card with a serif title + tagline (used on the Core services
 *           step so Photo / Video / Hybrid / Content creation read as a
 *           deliberate choice).
 *   - "md": standard card (Specializations, Offer components).
 *   - "sm": compact card (add-own preview, dense grids).
 *
 * Accent:
 *   - "photo" / "video" / "content" / "hybrid" produce a subtle pastel
 *     chroma on the unselected state so the groups are visually
 *     distinguishable without turning into a candy UI. When the card is
 *     selected, the sage-gold "on" treatment always wins.
 */
export type SelectorChoiceCardSize = "sm" | "md" | "lg";
export type SelectorChoiceCardAccent =
  | "neutral"
  | "photo"
  | "video"
  | "hybrid"
  | "content";

export type SelectorChoiceCardProps = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  selected: boolean;
  onToggle: () => void;
  size?: SelectorChoiceCardSize;
  disabled?: boolean;
  accent?: SelectorChoiceCardAccent;
  /**
   * Aria role. "checkbox" (multi-select) is the default; "radio" is used
   * when the parent grid is in `single` mode.
   */
  role?: "checkbox" | "radio";
  className?: string;
};

const SIZE_CLASSES: Record<SelectorChoiceCardSize, string> = {
  sm: "min-h-[54px] px-3.5 py-2.5 text-[13px]",
  md: "min-h-[72px] px-4 py-3 text-[14px] sm:text-[15px]",
  lg: "min-h-[112px] px-5 py-4 text-[15px] sm:text-[16px]",
};

const LABEL_CLASSES: Record<SelectorChoiceCardSize, string> = {
  sm: "text-[13px] font-medium leading-snug tracking-tight",
  md: "text-[14px] sm:text-[15px] font-medium leading-snug tracking-tight",
  lg: "font-serif text-[18px] sm:text-[20px] font-normal leading-[1.1] tracking-tight",
};

const DESCRIPTION_CLASSES: Record<SelectorChoiceCardSize, string> = {
  sm: "mt-0.5 text-[11px] leading-snug text-white/55",
  md: "mt-1 text-[11.5px] leading-snug text-white/55 sm:text-[12px]",
  lg: "mt-1.5 text-[12px] leading-snug text-white/65 sm:text-[13px]",
};

// Unselected chroma per accent — very faint, never louder than `bg-white/12`.
const ACCENT_BASE: Record<SelectorChoiceCardAccent, string> = {
  neutral: "bg-white/8",
  photo: "bg-[#c9d4c5]/10",
  video: "bg-[#c7cbd9]/10",
  hybrid: "bg-[#d4cac1]/10",
  content: "bg-[#cfcbd8]/10",
};

const ACCENT_HOVER: Record<SelectorChoiceCardAccent, string> = {
  neutral: "hover:bg-white/12",
  photo: "hover:bg-[#c9d4c5]/16",
  video: "hover:bg-[#c7cbd9]/16",
  hybrid: "hover:bg-[#d4cac1]/16",
  content: "hover:bg-[#cfcbd8]/16",
};

const BASE_CARD =
  "group relative flex w-full flex-col items-start justify-center rounded-2xl border border-white/18 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-0";

const SELECTED_CARD =
  "border-[#9ca893]/80 bg-[#9ca893]/22 shadow-[0_0_20px_rgba(156,168,147,0.28),inset_0_1px_0_rgba(255,255,255,0.1)]";

const DISABLED_CARD = "opacity-45 pointer-events-none";

/**
 * Keyboard — Space or Enter toggles; the parent grid owns arrow-key navigation.
 */
function handleKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  onToggle: () => void,
): void {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    onToggle();
  }
}

export const SelectorChoiceCard = forwardRef<
  HTMLButtonElement,
  SelectorChoiceCardProps
>(function SelectorChoiceCard(
  {
    id,
    label,
    description,
    selected,
    onToggle,
    size = "md",
    disabled,
    accent = "neutral",
    role = "checkbox",
    className,
  },
  ref,
) {
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
        BASE_CARD,
        SIZE_CLASSES[size],
        !selected && ACCENT_BASE[accent],
        !selected && !disabled && ACCENT_HOVER[accent],
        selected && SELECTED_CARD,
        disabled && DISABLED_CARD,
        "active:scale-[0.985]",
        className,
      )}
    >
      <span className={cn(LABEL_CLASSES[size], "block w-full text-balance")}>
        {label}
      </span>
      {description ? (
        <span
          className={cn(
            DESCRIPTION_CLASSES[size],
            "block w-full text-balance",
          )}
        >
          {description}
        </span>
      ) : null}
    </button>
  );
});
