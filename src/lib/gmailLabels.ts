import type { GmailLabelOption } from "../types/gmailImport.types";

export function sortGmailLabelsForDisplay(labels: GmailLabelOption[]): GmailLabelOption[] {
  return [...labels].sort((a, b) => {
    if (a.type !== b.type) return a.type === "user" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function parseGmailLabelsFromJson(raw: unknown): GmailLabelOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is GmailLabelOption =>
      x !== null &&
      typeof x === "object" &&
      typeof (x as GmailLabelOption).id === "string" &&
      typeof (x as GmailLabelOption).name === "string" &&
      ((x as GmailLabelOption).type === "system" || (x as GmailLabelOption).type === "user"),
  );
}
