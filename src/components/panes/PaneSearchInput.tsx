import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANE_SEARCH_INPUT_FIELD } from "./paneClasses";

export type PaneSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onBlur?: () => void;
  /** Show clear control when true (e.g. typed text) */
  showClear?: boolean;
  onClear?: () => void;
  /** Extra right padding without clear (e.g. active URL search state) */
  padRightForAux?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

/**
 * Inbox-style search: left icon, calm border, focus ring, optional clear.
 */
export function PaneSearchInput({
  value,
  onChange,
  placeholder,
  onBlur,
  showClear,
  onClear,
  padRightForAux,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: PaneSearchInputProps) {
  const label = ariaLabel ?? placeholder;
  const wideRight = Boolean(showClear || padRightForAux);
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          PANE_SEARCH_INPUT_FIELD,
          wideRight ? "pr-8" : "pr-2.5",
          inputClassName,
        )}
        aria-label={label}
      />
      {showClear && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
