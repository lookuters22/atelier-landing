import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANE_INBOX_SEARCH_INPUT_INNER, PANE_INBOX_SEARCH_SHELL, PANE_SEARCH_INPUT_FIELD } from "./paneClasses";

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
  /** `ctxRaised` — Ana `.ctx .search` raised shell (icon inline, borderless inner field). */
  variant?: "default" | "ctxRaised";
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
  variant = "default",
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: PaneSearchInputProps) {
  const label = ariaLabel ?? placeholder;
  const wideRight = Boolean(showClear || padRightForAux);

  if (variant === "ctxRaised") {
    return (
      <div className={cn("relative", className)}>
        <div className={PANE_INBOX_SEARCH_SHELL}>
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            className={cn(
              PANE_INBOX_SEARCH_INPUT_INNER,
              wideRight ? "pr-6" : "pr-0",
              inputClassName,
            )}
            aria-label={label}
          />
        </div>
        {showClear && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[3px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    );
  }

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
