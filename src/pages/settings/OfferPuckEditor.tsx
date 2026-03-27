import type { Data } from "@measured/puck";
import { Puck } from "@measured/puck";
import "@measured/puck/puck.css";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OFFER_PUCK_UI_VIEWPORTS, OFFER_PUCK_VIEWPORTS } from "../../features/offer-puck/puckDefaultViewports";
import { buildStandaloneHtmlFromPuck } from "../../features/offer-puck/exportHtml";
import { offerPuckConfig } from "../../features/offer-puck/offerPuckConfig";
import { OfferViewportProvider } from "../../features/offer-puck/OfferViewportContext";
import { normalizePuckData, projectDisplayName } from "../../lib/offerPuckNormalize";
import { getOfferProject, upsertOfferProject } from "../../lib/offerProjectsStorage";
import { OfferHtmlPreviewModal } from "../../features/offer-puck/OfferHtmlPreviewModal";
import { OfferPuckComponentOverlay } from "../../features/offer-puck/OfferPuckComponentOverlay";
import { OfferViewportControls } from "../../features/offer-puck/OfferViewportControls";
import { OfferBuilderPalettePortal } from "./OfferBuilderPaletteDock";
import { OfferPuckCanvasScrollOutlineSync } from "./OfferPuckCanvasScrollOutlineSync";
import { OfferPuckCanvasSelectionScroll } from "./OfferPuckCanvasSelectionScroll";
import { OfferPuckInitialSelection } from "./OfferPuckInitialSelection";
import { OfferPuckInspectorBridge } from "./OfferPuckInspectorBridge";
import { useOfferBuilderShell } from "./offerBuilderShellContext";

type OfferPuckEditorProps = {
  projectId: string;
};

function loadProjectData(projectId: string): Data {
  const p = getOfferProject(projectId);
  if (!p) {
    throw new Error("Missing project");
  }
  return normalizePuckData(p.data);
}

function clonePuckData(data: Data): Data {
  if (typeof structuredClone === "function") {
    return structuredClone(data) as Data;
  }
  return JSON.parse(JSON.stringify(data)) as Data;
}

export function OfferPuckEditor({ projectId }: OfferPuckEditorProps) {
  const { setCommands } = useOfferBuilderShell();
  const [data, setData] = useState<Data>(() => loadProjectData(projectId));
  const [editorKey, setEditorKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(
    () => OFFER_PUCK_VIEWPORTS[OFFER_PUCK_VIEWPORTS.length - 1]?.width ?? 1280,
  );

  useEffect(() => {
    setData(loadProjectData(projectId));
    setEditorKey((current) => current + 1);
    setPreviewViewportWidth(OFFER_PUCK_VIEWPORTS[OFFER_PUCK_VIEWPORTS.length - 1]?.width ?? 1280);
  }, [projectId]);

  const replaceDocument = useCallback((nextData: Data) => {
    setData(normalizePuckData(clonePuckData(nextData)));
    setEditorKey((current) => current + 1);
  }, []);

  const blockCount = Array.isArray(data.content) ? data.content.length : 0;

  /** DEV: warn if multi-block doc does not overflow the canvas scrollport (nested scroll / height trap). Manual check: `document.getElementById('puck-canvas-root')` then compare scrollHeight vs clientHeight. */
  useEffect(() => {
    if (!import.meta.env.DEV || blockCount < 2) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = document.getElementById("puck-canvas-root");
        if (!el || el.scrollHeight > el.clientHeight) return;
        console.warn(
          "[offer-puck] #puck-canvas-root scrollHeight <= clientHeight with multiple blocks — nested overflow or height chain may be capping content.",
          { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, blockCount },
        );
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [blockCount, projectId]);

  useEffect(() => {
    const p = getOfferProject(projectId);
    if (!p) return;
    const name = projectDisplayName(data);
    upsertOfferProject({
      ...p,
      name,
      updatedAt: new Date().toISOString(),
      data,
    });
  }, [projectId, data]);

  const previewSrc = useMemo(() => {
    try {
      return buildStandaloneHtmlFromPuck(data);
    } catch (e) {
      console.error("Offer HTML export failed:", e);
      return "<!DOCTYPE html><html><body><p>Preview could not be generated.</p></body></html>";
    }
  }, [data]);

  const downloadHtml = useCallback(() => {
    let html: string;
    try {
      html = buildStandaloneHtmlFromPuck(data);
    } catch (e) {
      console.error("Offer HTML export failed:", e);
      window.alert("Could not build HTML. Try resetting blocks or clearing site data for this page.");
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pricing-offer.html";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data]);

  const saveNow = useCallback(() => {
    const p = getOfferProject(projectId);
    if (!p) return;
    upsertOfferProject({
      ...p,
      name: projectDisplayName(data),
      updatedAt: new Date().toISOString(),
      data,
    });
  }, [projectId, data]);

  const documentTitle =
    (data.root?.props as { title?: string } | undefined)?.title?.trim() || "Magazine offer";

  useEffect(() => {
    setCommands({
      documentTitle,
      downloadHtml,
      saveNow,
      previewOpen,
      togglePreview: () => setPreviewOpen((v) => !v),
    });
    return () => setCommands(null);
  }, [setCommands, documentTitle, downloadHtml, saveNow, previewOpen]);

  const puckOverrides = useMemo(
    () => ({
      componentOverlay: OfferPuckComponentOverlay,
      puck: ({ children }: { children: ReactNode }) => (
        <>
          {children}
          <OfferViewportControls
            currentViewportWidth={previewViewportWidth}
            onChange={setPreviewViewportWidth}
          />
          <OfferPuckInspectorBridge />
          <OfferPuckCanvasSelectionScroll />
          <OfferPuckCanvasScrollOutlineSync />
          <OfferPuckInitialSelection />
          <OfferBuilderPalettePortal onApplyTemplate={replaceDocument} />
        </>
      ),
    }),
    [previewViewportWidth, replaceDocument],
  );

  const initialUi = useMemo(
    () => ({
      leftSideBarVisible: false,
      rightSideBarVisible: true,
      viewports: OFFER_PUCK_UI_VIEWPORTS,
    }),
    [],
  );
  const canvasViewportStyle = useMemo(
    () =>
      ({
        "--offer-builder-preview-width": `${previewViewportWidth}px`,
      }) as CSSProperties,
    [previewViewportWidth],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-0">
      <div
        className="offer-builder-puck flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas"
        style={canvasViewportStyle}
      >
        {/* Canvas must not use Puck’s iframe preview: inline edit CSS + pointer-events live in the parent document only. */}
        <OfferViewportProvider width={previewViewportWidth}>
          <Puck
            key={`${projectId}:${editorKey}`}
            config={offerPuckConfig}
            data={data}
            onChange={setData}
            ui={initialUi}
            viewports={OFFER_PUCK_VIEWPORTS}
            overrides={puckOverrides}
            iframe={{ enabled: false }}
            dnd={{ disableAutoScroll: true }}
          />
        </OfferViewportProvider>
      </div>
      <OfferHtmlPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} srcDoc={previewSrc} />
    </div>
  );
}
