/**
 * Re-exports read-only invoice-setup fetch for edge/Deno.
 * Implementation in `src/lib/fetchAssistantStudioInvoiceSetupRead.ts` uses relative imports (no Vite `@/`).
 */
export {
  fetchAssistantStudioInvoiceSetupRead,
  invoiceSetupSpecialistToolPayload,
} from "../../../../src/lib/fetchAssistantStudioInvoiceSetupRead.ts";
