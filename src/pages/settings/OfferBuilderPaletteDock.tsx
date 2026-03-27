import { Puck } from "@measured/puck";
import type { Data } from "@measured/puck";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { OfferTemplateEntry } from "../../features/offer-puck/templates/registry";
import { getTemplateCoverThumbnailSrc, offerTemplates } from "../../features/offer-puck/templates/registry";
import { getCachedOfferPreviewHtml, OfferHoverPreview } from "./OfferHoverPreview";
import { useOfferBuilderSettings } from "./offerBuilderSettingsContext";
import {
  PALETTE_TAB_BAR_ROW_CLASS,
  PALETTE_TAB_BUTTON_ACTIVE_CLASS,
  PALETTE_TAB_BUTTON_INACTIVE_CLASS,
} from "./offerBuilderPaletteTokens";

const PALETTE_ROOT_ID = "offer-builder-palette-root";

type PaletteDockProps = {
  onApplyTemplate: (data: Data) => void;
};

export function PaletteDock({ onApplyTemplate }: PaletteDockProps) {
  const [tab, setTab] = useState<"components" | "templates">("components");
  const [hoverTemplate, setHoverTemplate] = useState<OfferTemplateEntry | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const onTileMove = useCallback((e: React.MouseEvent) => {
    setMouse({ x: e.clientX, y: e.clientY });
  }, []);

  const applyTemplate = useCallback(
    (t: OfferTemplateEntry) => {
      if (
        window.confirm(
          `Replace the current document with "${t.label}"? This overwrites what is saved for this browser.`,
        )
      ) {
        onApplyTemplate(t.data);
      }
    },
    [onApplyTemplate],
  );

  const hoverHtml = useMemo(
    () => (hoverTemplate ? getCachedOfferPreviewHtml(hoverTemplate.data, hoverTemplate.id) : ""),
    [hoverTemplate],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={PALETTE_TAB_BAR_ROW_CLASS}>
        <div className="flex w-full gap-0.5">
          <button
            type="button"
            onClick={() => setTab("components")}
            className={
              "flex-1 " +
              (tab === "components" ? PALETTE_TAB_BUTTON_ACTIVE_CLASS : PALETTE_TAB_BUTTON_INACTIVE_CLASS)
            }
          >
            Components
          </button>
          <button
            type="button"
            onClick={() => setTab("templates")}
            className={
              "flex-1 " +
              (tab === "templates" ? PALETTE_TAB_BUTTON_ACTIVE_CLASS : PALETTE_TAB_BUTTON_INACTIVE_CLASS)
            }
          >
            Templates
          </button>
        </div>
      </div>

      {tab === "components" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 text-[13px]">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Blocks</p>
          <Puck.Components />
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Outline</p>
          <Puck.Outline />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
          {offerTemplates.map((t) => {
            const thumb = getTemplateCoverThumbnailSrc(t.data);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                onMouseEnter={(e) => {
                  setHoverTemplate(t);
                  setMouse({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoverTemplate(null)}
                onMouseMove={onTileMove}
                className="group relative flex aspect-square overflow-hidden rounded-lg border border-border text-left transition hover:border-accent/40 hover:ring-1 hover:ring-accent/30"
              >
                {thumb ? (
                  <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 bg-neutral-200" aria-hidden />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
                <span className="absolute bottom-0 left-0 right-0 p-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white drop-shadow-sm">
                  {t.label}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      )}

      {hoverTemplate && tab === "templates" ? (
        <OfferHoverPreview label={hoverTemplate.label} active mouse={mouse} html={hoverHtml} />
      ) : null}
    </div>
  );
}

type OfferBuilderPalettePortalProps = {
  onApplyTemplate: (data: Data) => void;
};

/** Renders inside Puck overrides.puck (under PuckProvider + DnD). Portals palette into #offer-builder-palette-root. */
export function OfferBuilderPalettePortal({ onApplyTemplate }: OfferBuilderPalettePortalProps): ReactNode {
  const ctx = useOfferBuilderSettings();
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNode(document.getElementById(PALETTE_ROOT_ID));
  }, [ctx?.paletteMountVersion]);

  if (!node) return null;

  return createPortal(<PaletteDock onApplyTemplate={onApplyTemplate} />, node);
}
