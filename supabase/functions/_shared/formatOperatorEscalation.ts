/**
 * Phase 8 Step 8F — single formatting path for operator-lane escalation copy (`execute_v3.md`).
 *
 * Output is deterministic (no model calls): short, one primary line, operational, suitable for WhatsApp.
 */
const MAX_CHARS = 280;

/**
 * Normalize photographer-facing escalation text: first non-empty line only, collapsed whitespace,
 * hard cap for SMS-style brevity.
 */
export function formatOperatorEscalationQuestion(raw: string): string {
  const firstLine =
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";

  let s = firstLine.replace(/\s+/g, " ").trim();
  if (!s) return "";

  if (s.length > MAX_CHARS) {
    s = s.slice(0, MAX_CHARS - 1).trimEnd() + "…";
  }

  return s;
}
