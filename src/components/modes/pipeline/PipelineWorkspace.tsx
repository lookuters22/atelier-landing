import { Layers } from "lucide-react";
import { usePipelineMode } from "./PipelineModeContext";
import { usePipelineWedding, PipelineTimelinePane } from "./PipelineWeddingContext";

export function PipelineWorkspace() {
  const { weddingId } = usePipelineMode();
  const weddingState = usePipelineWedding();

  if (!weddingId) {
    return (
      <div className="ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-[var(--surface-canvas)] px-6 text-center">
        <Layers className="h-9 w-9 text-[var(--fg-4)] opacity-80" strokeWidth={1.5} aria-hidden />
        <p className="font-[family-name:var(--font-sans)] text-[14px] tracking-[-0.01em] text-[var(--fg-3)]">
          Select a project from the list
        </p>
        <p className="max-w-sm font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--fg-4)]">
          Pipeline · projects grouped by stage
        </p>
      </div>
    );
  }

  if (!weddingState) {
    return (
      <div className="ana-inbox-port ana-pipeline-port flex h-full min-h-0 items-center justify-center bg-[var(--surface-canvas)]">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-4)]">
          Loading project…
        </span>
      </div>
    );
  }

  return <PipelineTimelinePane />;
}
