/**
 * Slice 5 — labels for operator CRM blocks by `weddings.project_type` (wedding | commercial | video | other).
 * Keeps wedding-default vocabulary from bleeding into other types.
 */
export function normalizeProjectTypeKey(raw: string): "wedding" | "commercial" | "video" | "other" {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "wedding" || t === "commercial" || t === "video" || t === "other") {
    return t;
  }
  return "other";
}

/** First line in focused facts: human-readable type for model framing. */
export function projectTypeFramingLine(projectType: string): string {
  const k = normalizeProjectTypeKey(projectType);
  const labels: Record<"wedding" | "commercial" | "video" | "other", string> = {
    wedding: "wedding",
    commercial: "commercial (brand / client work)",
    video: "video (production / video project)",
    other: "other (neutral project — no wedding default)",
  };
  return `**Project type (Slice 5 — set answer vocabulary):** ${k} — ${labels[k]}`;
}

export function displayTitleLabel(projectType: string): string {
  return normalizeProjectTypeKey(projectType) === "wedding"
    ? "Couple / project name (wedding)"
    : "Client / project title";
}

export function primaryDateLabel(projectType: string): string {
  return normalizeProjectTypeKey(projectType) === "wedding" ? "Wedding date" : "Event / schedule date";
}

export function keyPeopleSectionTitle(projectType: string): string {
  return normalizeProjectTypeKey(projectType) === "wedding"
    ? "Key people (wedding_people + people)"
    : "Key people (project roster + people)";
}
