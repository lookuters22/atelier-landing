import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Onboarding selector primitive — a compact "+ Add your own" affordance.
 *
 * Two visual variants:
 *   - "tile"   (default) — dashed glass tile, designed to sit inside a card grid.
 *   - "inline"           — borderless text button + hairline-underlined input,
 *                          designed to sit inside a `SelectorToggleList`.
 *
 * The parent decides what to do with the submitted label (typically push it
 * into `extensions.custom_specializations` or `extensions.custom_offer_components`).
 */
export type SelectorInlineAddOwnVariant = "tile" | "inline";

export type SelectorInlineAddOwnProps = {
  onAdd: (label: string) => void;
  placeholder?: string;
  addLabel?: string;
  maxLength?: number;
  /** Optional extra disabled guard (e.g. limit reached). */
  disabled?: boolean;
  variant?: SelectorInlineAddOwnVariant;
  className?: string;
};

const TILE_COLLAPSED =
  "flex min-h-[72px] w-full items-center justify-center rounded-2xl border border-dashed border-white/25 bg-white/5 px-4 py-3 text-[13px] font-medium leading-snug text-white/70 backdrop-blur-[20px] transition-colors duration-200 ease-out hover:border-white/45 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 active:scale-[0.99]";

const TILE_EXPANDED =
  "flex min-h-[72px] w-full items-center rounded-2xl border border-white/30 bg-white/10 px-3 py-2 backdrop-blur-[20px] transition-colors duration-200 ease-out focus-within:border-[#9ca893]/80 focus-within:bg-[#9ca893]/12 focus-within:shadow-[0_0_18px_rgba(156,168,147,0.25)]";

const INLINE_COLLAPSED =
  "flex w-full items-center justify-start gap-2 bg-transparent px-3 py-4 text-left text-[13px] font-medium leading-snug text-white/55 outline-none transition-colors duration-300 ease-out hover:text-white focus-visible:text-white focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-white/40";

const INLINE_EXPANDED =
  "flex w-full items-center gap-3 border-b border-[#9ca893]/55 bg-transparent px-3 py-3 transition-colors duration-300 ease-out focus-within:border-[#9ca893]";

export function SelectorInlineAddOwn({
  onAdd,
  placeholder = "Type a label",
  addLabel = "+ Add your own",
  maxLength = 48,
  disabled,
  variant = "tile",
  className,
}: SelectorInlineAddOwnProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setDraft("");
  }, []);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      close();
      return;
    }
    onAdd(trimmed);
    close();
  }, [draft, onAdd, close]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [commit, close],
  );

  const isInline = variant === "inline";

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          isInline ? INLINE_COLLAPSED : TILE_COLLAPSED,
          disabled && "opacity-45 pointer-events-none",
          className,
        )}
        data-selector-add-own="collapsed"
      >
        <span>{addLabel}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(isInline ? INLINE_EXPANDED : TILE_EXPANDED, className)}
      data-selector-add-own="expanded"
    >
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={addLabel}
        className={cn(
          "flex-1 bg-transparent leading-snug text-white outline-none placeholder:text-white/40",
          isInline ? "text-[15px]" : "text-[14px]",
        )}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className={cn(
          "rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55",
          isInline
            ? "text-[#cdd4c6] hover:text-white"
            : "ml-2 border border-white/25 bg-white/12 text-white/85 hover:bg-white/22",
        )}
      >
        Add
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
        className={cn(
          "rounded-full px-2 py-1 text-[11.5px] font-medium text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55",
          isInline ? "" : "ml-1 border border-transparent",
        )}
        aria-label="Cancel"
      >
        Cancel
      </button>
    </div>
  );
}
