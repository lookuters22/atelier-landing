/**
 * Browser local cache for invoice PDF setup. Anonymous vs signed-in are separated so
 * a shared device cannot attach the wrong local snapshot to a photographer's remote row.
 *
 * - Anonymous / legacy (logged-out, unknown tenant): one global key (backward compatible).
 * - Signed-in: one key per photographer; never use the global key for read/write/remote-seed.
 *
 * We do not copy legacy `atelier-invoice-setup` into a photographer’s scoped key on login: that
 * blob is not ownership-tagged, so it could belong to another account on a shared device.
 */

export const INVOICE_SETUP_LOCAL_ANONYMOUS_KEY = "atelier-invoice-setup";

/**
 * @deprecated Use INVOICE_SETUP_LOCAL_ANONYMOUS_KEY. Legacy name for the anonymous bucket only.
 */
export const INVOICE_STORAGE_KEY = INVOICE_SETUP_LOCAL_ANONYMOUS_KEY;

/** `null` / missing photographer id → anonymous/legacy; otherwise tenant-scoped. */
export function invoiceSetupLocalStorageKey(photographerId: string | null | undefined): string {
  if (photographerId == null || photographerId === "") {
    return INVOICE_SETUP_LOCAL_ANONYMOUS_KEY;
  }
  return `atelier-invoice-setup-v1:photographer:${photographerId}`;
}
