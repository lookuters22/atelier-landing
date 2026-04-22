export type InvoiceSetupState = {
  legalName: string;
  invoicePrefix: string;
  paymentTerms: string;
  accentColor: string;
  footerNote: string;
  logoDataUrl: string | null;
};

/** Bump when persisted JSON shape changes; Ana patches target this version. */
export const INVOICE_SETUP_SCHEMA_VERSION = 1 as const;

export type InvoiceTemplatePersistedV1 = InvoiceSetupState & {
  schema_version: typeof INVOICE_SETUP_SCHEMA_VERSION;
};

// Re-export local cache keys; signed-in app code must not use a global key for tenant data.
export {
  INVOICE_SETUP_LOCAL_ANONYMOUS_KEY,
  INVOICE_STORAGE_KEY,
  invoiceSetupLocalStorageKey,
} from "./invoiceSetupLocalKey";

export function defaultInvoiceSetup(): InvoiceSetupState {
  return {
    legalName: "Atelier · Elena Duarte",
    invoicePrefix: "ATL",
    paymentTerms: "Net 15 · Bank transfer",
    accentColor: "#3b4ed0",
    footerNote: "Thank you for your business.",
    logoDataUrl: null,
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Validates JSON from DB or browser local cache (per-tenant or anonymous) into UI state. */
export function parseInvoiceTemplateJson(raw: unknown): InvoiceSetupState {
  const d = defaultInvoiceSetup();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  return {
    legalName: isNonEmptyString(o.legalName) ? o.legalName : d.legalName,
    invoicePrefix: isNonEmptyString(o.invoicePrefix) ? o.invoicePrefix : d.invoicePrefix,
    paymentTerms: isNonEmptyString(o.paymentTerms) ? o.paymentTerms : d.paymentTerms,
    accentColor: isNonEmptyString(o.accentColor) ? o.accentColor : d.accentColor,
    footerNote: typeof o.footerNote === "string" ? o.footerNote : d.footerNote,
    logoDataUrl: o.logoDataUrl === null || typeof o.logoDataUrl === "string" ? o.logoDataUrl : d.logoDataUrl,
  };
}

export function toPersistedTemplate(setup: InvoiceSetupState): InvoiceTemplatePersistedV1 {
  return { ...setup, schema_version: INVOICE_SETUP_SCHEMA_VERSION };
}
