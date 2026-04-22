/**
 * Bounded read of `studio_invoice_setup` for operator Ana (tenant-scoped, read-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.ts";
import type { AssistantStudioInvoiceSetupRead } from "../types/assistantContext.types.ts";
import { fetchInvoiceSetupRemote } from "./invoiceSetupRemote.ts";
import { mapInvoiceTemplateToAssistantRead, MAX_INVOICE_FOOTER_CONTEXT_CHARS } from "./invoiceAssistantSummary.ts";

const NO_ROW_NOTE =
  "No `studio_invoice_setup` row for this tenant in this read — use **Settings → Invoice setup** in the app if the studio has not saved template data yet.";

const S3_PIN_EVIDENCE_NOTE =
  "Grounded from **studio_invoice_setup** for this tenant. **Logo** is summary-only (hasLogo / mime / size) — **never** raw image bytes in chat or proposals.";

/** Compact JSON for S3 specialist context / LLM (same read as normal `studioInvoiceSetup`, re-serialized for the pin block). */
export function invoiceSetupSpecialistToolPayload(read: AssistantStudioInvoiceSetupRead): Record<string, unknown> {
  return {
    didRun: true,
    selectionNote: read.hasRow ? "ok" : "no_invoice_setup_row",
    template: {
      hasRow: read.hasRow,
      updatedAt: read.updatedAt,
      legalName: read.legalName,
      invoicePrefix: read.invoicePrefix,
      paymentTerms: read.paymentTerms,
      accentColor: read.accentColor,
      footerNote: read.footerNote,
      footerNoteTruncated: read.footerNoteTruncated,
      logo: read.logo,
    },
    readNote: read.note,
    evidenceNote: S3_PIN_EVIDENCE_NOTE,
  };
}

export async function fetchAssistantStudioInvoiceSetupRead(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<AssistantStudioInvoiceSetupRead> {
  const row = await fetchInvoiceSetupRemote(supabase, photographerId);
  if (!row) {
    return {
      hasRow: false,
      updatedAt: null,
      legalName: "",
      invoicePrefix: "",
      paymentTerms: "",
      accentColor: "",
      footerNote: "",
      footerNoteTruncated: false,
      logo: {
        hasLogo: false,
        mimeType: null,
        approxDataUrlChars: 0,
        note: "No row — logo unknown.",
      },
      note: NO_ROW_NOTE,
    };
  }
  return mapInvoiceTemplateToAssistantRead(row.template, row.updatedAt, MAX_INVOICE_FOOTER_CONTEXT_CHARS);
}
