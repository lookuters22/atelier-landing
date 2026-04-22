import { beforeEach, describe, expect, it } from "vitest";
import {
  INVOICE_SETUP_LOCAL_ANONYMOUS_KEY,
  INVOICE_STORAGE_KEY,
  invoiceSetupLocalStorageKey,
} from "./invoiceSetupLocalKey";
import { defaultInvoiceSetup, parseInvoiceTemplateJson, type InvoiceSetupState } from "./invoiceSetupTypes";

const PHOTO_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PHOTO_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function readSetupFromStore(store: Record<string, string>, photographerId: string | null): InvoiceSetupState {
  const key = invoiceSetupLocalStorageKey(photographerId);
  const raw = store[key];
  if (!raw) return defaultInvoiceSetup();
  return parseInvoiceTemplateJson(JSON.parse(raw) as unknown);
}

describe("invoiceSetupLocalStorageKey", () => {
  it("uses stable anonymous/legacy key for missing or null photographer id (logged-out)", () => {
    expect(invoiceSetupLocalStorageKey(null)).toBe(INVOICE_SETUP_LOCAL_ANONYMOUS_KEY);
    expect(invoiceSetupLocalStorageKey(undefined)).toBe(INVOICE_SETUP_LOCAL_ANONYMOUS_KEY);
    expect(invoiceSetupLocalStorageKey("")).toBe(INVOICE_SETUP_LOCAL_ANONYMOUS_KEY);
    expect(INVOICE_STORAGE_KEY).toBe(INVOICE_SETUP_LOCAL_ANONYMOUS_KEY);
  });

  it("uses a distinct key per photographer when signed in", () => {
    expect(invoiceSetupLocalStorageKey(PHOTO_A)).toBe(`atelier-invoice-setup-v1:photographer:${PHOTO_A}`);
    expect(invoiceSetupLocalStorageKey(PHOTO_B)).toBe(`atelier-invoice-setup-v1:photographer:${PHOTO_B}`);
    expect(invoiceSetupLocalStorageKey(PHOTO_A)).not.toBe(invoiceSetupLocalStorageKey(PHOTO_B));
  });
});

describe("shared-browser local cache (no cross-tenant bleed)", () => {
  let mem: Record<string, string>;

  beforeEach(() => {
    mem = {};
  });

  it("photographer B does not read A's scoped cache; empty B key yields defaults (safe remote seed source)", () => {
    const aCustom: InvoiceSetupState = {
      ...defaultInvoiceSetup(),
      legalName: "Studio A Only",
      invoicePrefix: "AAA",
    };
    mem[invoiceSetupLocalStorageKey(PHOTO_A)] = JSON.stringify(aCustom);

    const bRead = readSetupFromStore(mem, PHOTO_B);
    expect(bRead.legalName).toBe(defaultInvoiceSetup().legalName);
    expect(bRead.invoicePrefix).toBe(defaultInvoiceSetup().invoicePrefix);
  });

  it("legacy global key data is not visible as B's tenant-scoped read (prevents seeding B from A's global dump)", () => {
    const aInGlobal: InvoiceSetupState = {
      ...defaultInvoiceSetup(),
      legalName: "WrongAccount",
    };
    mem[INVOICE_SETUP_LOCAL_ANONYMOUS_KEY] = JSON.stringify(aInGlobal);

    const bRead = readSetupFromStore(mem, PHOTO_B);
    expect(bRead.legalName).toBe(defaultInvoiceSetup().legalName);
  });

  it("same photographer: custom data in scoped cache is the state used for initial load and safe empty-remote seed", () => {
    const custom: InvoiceSetupState = {
      ...defaultInvoiceSetup(),
      legalName: "My Studio",
      invoicePrefix: "ZZZ",
    };
    mem[invoiceSetupLocalStorageKey(PHOTO_A)] = JSON.stringify(custom);

    const read = readSetupFromStore(mem, PHOTO_A);
    expect(read).toEqual(custom);
  });
});

describe("remote row vs local (behavioral contract)", () => {
  it("when a remote template exists, it must override tenant-scoped local for display (server canonical)", () => {
    const local: InvoiceSetupState = { ...defaultInvoiceSetup(), legalName: "Stale Local" };
    const remoteTemplate: InvoiceSetupState = { ...defaultInvoiceSetup(), legalName: "Server Truth" };

    const row = { template: remoteTemplate, updatedAt: "2026-01-01T00:00:00.000Z" };
    const chosen = row ? row.template : local;
    expect(chosen.legalName).toBe("Server Truth");
  });

  it("when no remote row, empty-remote seed uses tenant-scoped local only (not a global key)", () => {
    const mem: Record<string, string> = {};
    const pid = PHOTO_A;
    const scoped = { ...defaultInvoiceSetup(), footerNote: "Scoped only" };
    mem[invoiceSetupLocalStorageKey(pid)] = JSON.stringify(scoped);
    mem[INVOICE_SETUP_LOCAL_ANONYMOUS_KEY] = JSON.stringify({
      ...defaultInvoiceSetup(),
      footerNote: "Anonymous should be ignored for signed-in seed",
    });

    const fromLocal = readSetupFromStore(mem, pid);
    expect(fromLocal.footerNote).toBe("Scoped only");
  });
});
