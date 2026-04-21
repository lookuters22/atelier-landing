/**
 * Deterministic v1 mapping from dispatch intent + profile + inbound text to `weddings.project_type`
 * when promoting an in-scope non-wedding customer lead. Uses existing profile JSON only.
 */
import type { Database } from "../../../../src/types/database.types.ts";
import type { TriageIntent } from "../agents/triage.ts";

export type WeddingProjectType = Database["public"]["Enums"]["wedding_project_type"];

function parseServiceTypesLower(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function inferPromotedNonWeddingProjectTypeV1(input: {
  dispatchIntent: TriageIntent;
  profile: {
    service_types?: unknown;
    core_services?: unknown;
  } | null;
  threadTitle: string | null | undefined;
  rawMessagePreview: string;
}): WeddingProjectType {
  if (input.dispatchIntent === "commercial") {
    return "commercial";
  }

  const text = `${input.threadTitle ?? ""}\n${input.rawMessagePreview}`.toLowerCase();
  const familyHint =
    /\bfamily\b|\bfamilies\b|\bmaternity\b|\bnewborn\b|\bchildren\b|\bkids?\b/.test(text);
  const portraitHint = /\bportrait\b|\bheadshots?\b|\bhead shot\b/.test(text);

  if (familyHint) return "family";
  if (portraitHint) return "portrait";

  const serviceTypes = parseServiceTypesLower(input.profile?.service_types);
  if (input.dispatchIntent === "concierge") {
    if (serviceTypes.includes("family_maternity")) return "family";
    if (serviceTypes.includes("portraiture")) return "portrait";
  }

  return "other";
}
