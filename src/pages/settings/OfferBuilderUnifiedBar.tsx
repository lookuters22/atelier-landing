import { ChevronLeft, Download, Eye, MessageCircle, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { openAnaWithOfferBuilderProject } from "../../components/SupportAssistantWidget";
import { useOfferBuilderShell } from "./offerBuilderShellContext";

export function OfferBuilderUnifiedBar(props: { offerProjectId: string }) {
  const navigate = useNavigate();
  const { commands } = useOfferBuilderShell();

  return (
    <div
      className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4"
      aria-label="Offer builder actions"
    >
      <button
        type="button"
        onClick={() => navigate("/workspace/offer-builder")}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Settings
      </button>

      <p className="text-[13px] font-semibold text-foreground">
        {commands?.documentTitle ?? "Offer Editor"}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => openAnaWithOfferBuilderProject(props.offerProjectId)}
          title="Open Ana in offer-builder specialist mode for this document"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Ana
        </button>
        <button
          type="button"
          onClick={() => commands?.togglePreview()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          Preview
        </button>
        <button
          type="button"
          onClick={() => commands?.downloadHtml()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Export
        </button>
        <button
          type="button"
          onClick={() => commands?.saveNow()}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
          Save
        </button>
      </div>
    </div>
  );
}
