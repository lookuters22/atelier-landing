import type { GmailLabelOption } from "../types/gmailImport.types";

/** User Gmail labels present on a thread (excludes system labels like INBOX / UNREAD). */
export function userGmailLabelsOnThread(
  gmailLabelIds: string[] | null,
  catalog: readonly GmailLabelOption[],
): GmailLabelOption[] {
  if (!gmailLabelIds?.length || catalog.length === 0) return [];
  const byId = new Map(catalog.map((l) => [l.id, l] as const));
  const out: GmailLabelOption[] = [];
  for (const id of gmailLabelIds) {
    const row = byId.get(id);
    if (row?.type === "user") out.push(row);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}
