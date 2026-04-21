/**
 * Left-rail `.ctx-label .sw` backgrounds copied verbatim from
 * `export/redesign/Ana Dashboard.html` (Inbox mock: Projects + Gmail labels rows).
 */

/** Projects block — lines with `Capri · Thorne…` through `Positano · Smith…`. */
export const ANA_INBOX_RAIL_PROJECT_SWATCHES = ["#65b5ff", "#ff2067", "#b3e01c", "#dedbd6"] as const;

/** Gmail labels block — lines `Inquiry`, `Vendor`, `VIP`. */
export const ANA_INBOX_RAIL_GMAIL_LABEL_SWATCHES = ["#f2b8e1", "#9c9fa5", "#ff5600"] as const;

export function anaInboxRailProjectSwatch(index: number): string {
  return ANA_INBOX_RAIL_PROJECT_SWATCHES[index % ANA_INBOX_RAIL_PROJECT_SWATCHES.length]!;
}

export function anaInboxRailGmailLabelSwatch(index: number): string {
  return ANA_INBOX_RAIL_GMAIL_LABEL_SWATCHES[index % ANA_INBOX_RAIL_GMAIL_LABEL_SWATCHES.length]!;
}
