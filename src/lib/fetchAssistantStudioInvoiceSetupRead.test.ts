import { describe, expect, it } from "vitest";
import {
  fetchAssistantStudioInvoiceSetupRead,
  invoiceSetupSpecialistToolPayload,
} from "./fetchAssistantStudioInvoiceSetupRead.ts";
import type { Database } from "../types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("fetchAssistantStudioInvoiceSetupRead", () => {
  it("returns hasRow false when no studio_invoice_setup row", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("studio_invoice_setup");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    } as SupabaseClient<Database>;

    const r = await fetchAssistantStudioInvoiceSetupRead(supabase, "p1");
    expect(r.hasRow).toBe(false);
    expect(r.invoicePrefix).toBe("");
  });

  it("invoiceSetupSpecialistToolPayload marks selectionNote from hasRow", () => {
    const ok = invoiceSetupSpecialistToolPayload({
      hasRow: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      legalName: "L",
      invoicePrefix: "P",
      paymentTerms: "Net 30",
      accentColor: "#000",
      footerNote: "Thanks",
      footerNoteTruncated: false,
      logo: { hasLogo: false, mimeType: null, approxDataUrlChars: 0, note: "n" },
      note: "ctx",
    });
    expect(ok.selectionNote).toBe("ok");
    expect((ok.template as { legalName: string }).legalName).toBe("L");

    const empty = invoiceSetupSpecialistToolPayload({
      hasRow: false,
      updatedAt: null,
      legalName: "",
      invoicePrefix: "",
      paymentTerms: "",
      accentColor: "",
      footerNote: "",
      footerNoteTruncated: false,
      logo: { hasLogo: false, mimeType: null, approxDataUrlChars: 0, note: "" },
      note: "none",
    });
    expect(empty.selectionNote).toBe("no_invoice_setup_row");
  });
});
