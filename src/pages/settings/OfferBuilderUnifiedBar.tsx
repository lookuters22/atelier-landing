import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Eye, FileText, LogOut, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOfferBuilderShell } from "./offerBuilderShellContext";
import {
  PALETTE_TAB_BAR_FLOATING_ROW_CLASS,
  PALETTE_TAB_BUTTON_ACTIVE_CLASS,
} from "./offerBuilderPaletteTokens";

export function OfferBuilderUnifiedBar() {
  const navigate = useNavigate();
  const { commands } = useOfferBuilderShell();
  const [fileOpen, setFileOpen] = useState(false);
  const fileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (fileRef.current && !fileRef.current.contains(e.target as Node)) setFileOpen(false);
    }
    if (fileOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [fileOpen]);

  const tabBtn = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${PALETTE_TAB_BUTTON_ACTIVE_CLASS}`;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[65] flex items-start justify-start gap-0"
      aria-label="Offer builder actions"
    >
      <div className={`pointer-events-auto ${PALETTE_TAB_BAR_FLOATING_ROW_CLASS}`}>
        <div ref={fileRef} className="relative">
          <button
            type="button"
            aria-expanded={fileOpen}
            aria-haspopup="menu"
            onClick={() => setFileOpen((o) => !o)}
            className={tabBtn}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-85" strokeWidth={1.75} />
            File
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
          </button>
          {fileOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-full z-[70] mt-1 min-w-[12rem] rounded-md border border-border bg-surface py-1 shadow-sm"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
                onClick={() => {
                  setFileOpen(false);
                  commands?.togglePreview();
                }}
              >
                <Eye className="h-4 w-4 opacity-80" strokeWidth={1.75} />
                {commands?.previewOpen ? "Close HTML preview" : "Preview HTML"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
                onClick={() => {
                  setFileOpen(false);
                  commands?.downloadHtml();
                }}
              >
                <Download className="h-4 w-4 opacity-80" strokeWidth={1.75} />
                Download HTML
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
                onClick={() => {
                  setFileOpen(false);
                  commands?.saveNow();
                }}
              >
                <Save className="h-4 w-4 opacity-80" strokeWidth={1.75} />
                Save
              </button>
              <div className="my-1 border-t border-border" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink hover:bg-canvas"
                onClick={() => {
                  setFileOpen(false);
                  navigate("/settings/offer-builder");
                }}
              >
                <LogOut className="h-4 w-4 opacity-80" strokeWidth={1.75} />
                Exit editor
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
