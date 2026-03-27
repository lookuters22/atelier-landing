import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OFFER_PUCK_VIEWPORTS } from "./puckDefaultViewports";

const iconMap = {
  Smartphone,
  Tablet,
  Monitor,
} as const;

type OfferHtmlPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  srcDoc: string;
};

export function OfferHtmlPreviewModal({ open, onClose, srcDoc }: OfferHtmlPreviewModalProps) {
  const [viewportWidth, setViewportWidth] = useState(
    () => OFFER_PUCK_VIEWPORTS[OFFER_PUCK_VIEWPORTS.length - 1]?.width ?? 1280,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="HTML preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90vh,920px)] w-full max-w-[min(96vw,1340px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-canvas/80 px-4 py-2.5">
          <div className="w-9 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5">
            {OFFER_PUCK_VIEWPORTS.map((vp, i) => {
              const Icon = typeof vp.icon === "string" ? iconMap[vp.icon as keyof typeof iconMap] : null;
              const active = viewportWidth === vp.width;
              return (
                <button
                  key={i}
                  type="button"
                  title={vp.label ? `${vp.label} (${vp.width}px)` : `${vp.width}px`}
                  onClick={() => setViewportWidth(vp.width)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                    active
                      ? "border-ink/25 bg-ink text-white shadow-sm"
                      : "border-border bg-surface text-ink-muted hover:border-border hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                  <span>{vp.label ?? vp.width}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted transition hover:bg-canvas hover:text-ink"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-neutral-200/80 p-4 sm:p-6">
          <div
            className="mx-auto flex min-h-[min(70vh,720px)] justify-center bg-white shadow-inner"
            style={{
              width: "100%",
              maxWidth: `${viewportWidth}px`,
            }}
          >
            <iframe
              title="Exported HTML preview"
              className="h-[min(70vh,720px)] w-full min-w-0 border-0 bg-white"
              srcDoc={srcDoc}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
