import type { Database } from "@/types/database.types";

export type WeddingProjectTypeEnum = Database["public"]["Enums"]["wedding_project_type"];

const SHORT_LABELS: Record<WeddingProjectTypeEnum, string> = {
  wedding: "Wedding",
  portrait: "Portrait",
  commercial: "Commercial",
  family: "Family",
  editorial: "Editorial",
  brand_content: "Brand content",
  other: "Other",
};

/** User-facing label for chips and badges (full words). */
export function formatProjectTypeUiLabel(projectType: string | null | undefined): string {
  if (!projectType) return "Project";
  return SHORT_LABELS[projectType as WeddingProjectTypeEnum] ?? projectType.replace(/_/g, " ");
}

/**
 * Short label for list/timeline chips. Returns `null` for wedding rows so default wedding UX stays quiet.
 */
export function projectTypeBadgeLabel(projectType: string | null | undefined): string | null {
  if (!projectType || projectType === "wedding") return null;
  return SHORT_LABELS[projectType as WeddingProjectTypeEnum] ?? projectType.replace(/_/g, " ");
}

export function isNonWeddingProjectType(projectType: string | null | undefined): boolean {
  return Boolean(projectType && projectType !== "wedding");
}
