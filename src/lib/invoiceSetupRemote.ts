import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import {
  parseInvoiceTemplateJson,
  toPersistedTemplate,
  type InvoiceSetupState,
} from "./invoiceSetupTypes";

export type InvoiceSetupRow = {
  template: InvoiceSetupState;
  updatedAt: string;
};

export async function fetchInvoiceSetupRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<InvoiceSetupRow | null> {
  const { data, error } = await supabase
    .from("studio_invoice_setup")
    .select("template, updated_at")
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { template: Json; updated_at: string };
  return {
    template: parseInvoiceTemplateJson(row.template),
    updatedAt: row.updated_at,
  };
}

export async function upsertInvoiceSetupRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  setup: InvoiceSetupState,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const payload: Database["public"]["Tables"]["studio_invoice_setup"]["Insert"] = {
    photographer_id: photographerId,
    template: toPersistedTemplate(setup) as unknown as Json,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from("studio_invoice_setup").upsert(payload, {
    onConflict: "photographer_id",
  });
  if (error) throw new Error(error.message);
}
