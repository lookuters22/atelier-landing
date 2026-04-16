import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Matches Identity cinematic combobox — closed field */
const cinematicGlassTrigger =
  "w-full rounded-xl border border-white/20 bg-white/10 px-5 py-4 pr-11 text-left text-[15px] leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] transition-[background,border-color] focus:border-white/45 focus:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-white/15";

/** Portal list — same as Identity `identityGlassListFixed` */
const cinematicGlassListFixed =
  "fixed z-[10000] max-h-[min(18rem,50vh)] overflow-auto rounded-xl border border-white/20 bg-white/10 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_-16px_rgba(0,0,0,0.4)] backdrop-blur-[20px]";

function useAnchorRect(anchorRef: RefObject<HTMLElement | null>, open: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    const update = () => {
      const next = anchorRef.current?.getBoundingClientRect();
      if (next) setRect(next);
    };
    update();
    let raf = 0;
    if (!anchorRef.current) {
      raf = requestAnimationFrame(() => update());
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  return rect;
}

export type CinematicGlassSelectOption = { value: string; label: string };

export type CinematicGlassSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly CinematicGlassSelectOption[];
  ariaLabel: string;
  className?: string;
};

export function CinematicGlassSelect({ id: idProp, value, onChange, options, ariaLabel, className }: CinematicGlassSelectProps) {
  const genId = useId();
  const listboxId = `${genId}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listPortalRef = useRef<HTMLUListElement>(null);
  const anchorRect = useAnchorRect(triggerRef, open);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (listPortalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlighted(idx);
  }, [value, options]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={cn("relative z-50 w-full", className)}>
      <button
        ref={triggerRef}
        id={idProp ?? genId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        className={cn(cinematicGlassTrigger, "relative")}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.preventDefault();
            return;
          }
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              setOpen(true);
              e.preventDefault();
            }
            return;
          }
          if (e.key === "ArrowDown") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.min(options.length - 1, h + 1));
            e.preventDefault();
            return;
          }
          if (e.key === "ArrowUp") {
            if (options.length === 0) return;
            setHighlighted((h) => Math.max(0, h - 1));
            e.preventDefault();
            return;
          }
          if (e.key === "Enter" && options[highlighted]) {
            pick(options[highlighted]!.value);
            e.preventDefault();
          }
        }}
      >
        <span className="block min-w-0 truncate pr-1">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-white/55 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && anchorRect
        ? createPortal(
            <ul
              ref={listPortalRef}
              id={listboxId}
              role="listbox"
              className={cinematicGlassListFixed}
              style={{
                top: anchorRect.bottom + 8,
                left: anchorRect.left,
                width: anchorRect.width,
                zIndex: 10000,
              }}
            >
              {options.map((opt, i) => {
                const active = i === highlighted;
                return (
                  <li key={opt.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === opt.value}
                      className={cn(
                        "flex w-full cursor-pointer px-3 py-2.5 text-left text-[13px] leading-snug transition-colors",
                        active ? "bg-white/14 text-white" : "text-white/90 hover:bg-white/8",
                      )}
                      onMouseEnter={() => setHighlighted(i)}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => pick(opt.value)}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
