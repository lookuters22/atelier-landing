export type InvoiceSetupState = {
  legalName: string;
  invoicePrefix: string;
  paymentTerms: string;
  accentColor: string;
  footerNote: string;
  logoDataUrl: string | null;
};

export const INVOICE_STORAGE_KEY = "atelier-invoice-setup";

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
