/**
 * S2 — single `studio_offer_builder_projects` row for operator Ana specialist mode (tenant-scoped pin).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "@measured/puck";
import type { Database } from "../types/database.types";
import { summarizeOfferPuckDataForAssistant } from "./offerPuckAssistantSummary.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVIDENCE_NOTE =
  "Grounded from **studio_offer_builder_projects** for this tenant. **compactSummary** is Puck-derived (outline / package names) — not a full PDF or layout authority.";

export type AssistantOfferBuilderProjectPinSnapshot = {
  didRun: true;
  selectionNote: "ok" | "invalid_offer_project_id" | "offer_project_not_found_or_denied";
  projectId: string | null;
  displayName: string | null;
  updatedAt: string | null;
  compactSummary: string | null;
};

export function offerBuilderProjectPinToolPayload(snap: AssistantOfferBuilderProjectPinSnapshot): Record<string, unknown> {
  return {
    didRun: snap.didRun,
    selectionNote: snap.selectionNote,
    project: {
      id: snap.projectId,
      displayName: snap.displayName,
      updatedAt: snap.updatedAt,
      compactSummary: snap.compactSummary,
    },
    evidenceNote: EVIDENCE_NOTE,
  };
}

export async function fetchAssistantOfferBuilderProjectPin(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  projectIdRaw: string,
): Promise<AssistantOfferBuilderProjectPinSnapshot> {
  const projectId = String(projectIdRaw ?? "").trim();
  if (!UUID_RE.test(projectId)) {
    return {
      didRun: true,
      selectionNote: "invalid_offer_project_id",
      projectId: null,
      displayName: null,
      updatedAt: null,
      compactSummary: null,
    };
  }

  const { data, error } = await supabase
    .from("studio_offer_builder_projects")
    .select("id, name, puck_data, updated_at")
    .eq("photographer_id", photographerId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchAssistantOfferBuilderProjectPin: ${error.message}`);
  }

  if (!data) {
    return {
      didRun: true,
      selectionNote: "offer_project_not_found_or_denied",
      projectId,
      displayName: null,
      updatedAt: null,
      compactSummary: null,
    };
  }

  const displayName = String(data.name ?? "").trim() || "Untitled offer";
  const compactSummary = summarizeOfferPuckDataForAssistant(data.puck_data as unknown as Data);

  return {
    didRun: true,
    selectionNote: "ok",
    projectId: String(data.id),
    displayName,
    updatedAt: String(data.updated_at),
    compactSummary,
  };
}
