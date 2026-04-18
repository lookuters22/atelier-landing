/** Structured lines in `people.notes` for directory contacts (v1). */

export function buildContactNotes(parts: {
  role?: string;
  company?: string;
  userNotes?: string;
}): string | null {
  const lines: string[] = [];
  if (parts.role?.trim()) lines.push(`Role: ${parts.role.trim()}`);
  if (parts.company?.trim()) lines.push(`Company: ${parts.company.trim()}`);
  if (parts.userNotes?.trim()) {
    if (lines.length) lines.push("---");
    lines.push(parts.userNotes.trim());
  }
  return lines.length ? lines.join("\n") : null;
}

export function parseRoleFromNotes(notes: string | null): string {
  if (!notes?.trim()) return "Contact";
  const m = /^Role:\s*(.+)$/m.exec(notes);
  return m?.[1]?.trim() || "Contact";
}

export function parseCompanyFromNotes(notes: string | null): string | undefined {
  if (!notes?.trim()) return undefined;
  const m = /^Company:\s*(.+)$/m.exec(notes);
  return m?.[1]?.trim() || undefined;
}
