import { useMemo } from "react";
import {
  PaneInspectorFrame,
  PaneInspectorScrollBody,
  PaneInspectorSectionTitle,
  PANE_INSPECTOR_IDLE_LIST_CARD,
  PANE_INSPECTOR_SECONDARY,
} from "@/components/panes";
import { useAuth } from "../../../context/AuthContext";
import { useWeddings } from "../../../hooks/useWeddings";
import { usePipelineMode } from "./PipelineModeContext";
import { usePipelineWedding, PipelineSidebarCards } from "./PipelineWeddingContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

export function PipelineInspector() {
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const { weddingId } = usePipelineMode();
  const weddingState = usePipelineWedding();

  const summary = useMemo(() => {
    let inquiries = 0;
    let active = 0;
    let deliverables = 0;
    let archived = 0;
    for (const w of weddings) {
      if (INQUIRY_STAGES.has(w.stage)) inquiries += 1;
      else if (ACTIVE_STAGES.has(w.stage)) active += 1;
      else if (DELIVERABLE_STAGES.has(w.stage)) deliverables += 1;
      else if (w.stage === "archived") archived += 1;
    }
    return { total: weddings.length, inquiries, active, deliverables, archived };
  }, [weddings]);

  if (!weddingId) {
    return (
      <PaneInspectorFrame>
        <div className="shrink-0 px-4 pt-4 pb-5">
          <PaneInspectorSectionTitle className="mb-1">Pipeline Overview</PaneInspectorSectionTitle>
          <p className={PANE_INSPECTOR_SECONDARY}>
            Total weddings: <span className="font-medium text-foreground">{summary.total}</span>
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <PaneInspectorSectionTitle className="mb-2">By stage</PaneInspectorSectionTitle>
            <ul className="space-y-2.5 text-[12px] text-muted-foreground">
              <li className="flex justify-between gap-2">
                <span>Inquiries</span>
                <span className="font-medium tabular-nums text-foreground">{summary.inquiries}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Active Bookings</span>
                <span className="font-medium tabular-nums text-foreground">{summary.active}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Deliverables</span>
                <span className="font-medium tabular-nums text-foreground">{summary.deliverables}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Archived</span>
                <span className="font-medium tabular-nums text-foreground">{summary.archived}</span>
              </li>
            </ul>
          </div>
        </div>
      </PaneInspectorFrame>
    );
  }

  if (!weddingState) {
    return (
      <PaneInspectorFrame>
        <div className="flex h-full min-h-[120px] items-center justify-center p-4">
          <span className={PANE_INSPECTOR_SECONDARY}>Loading…</span>
        </div>
      </PaneInspectorFrame>
    );
  }

  return (
    <PaneInspectorFrame>
      <PaneInspectorScrollBody>
        <PipelineSidebarCards />
      </PaneInspectorScrollBody>
    </PaneInspectorFrame>
  );
}
