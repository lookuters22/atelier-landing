import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVOICE_SETUP_SCHEMA_VERSION,
  defaultInvoiceSetup,
  parseInvoiceTemplateJson,
  toPersistedTemplate,
} from "./invoiceSetupTypes";
import { fetchInvoiceSetupRemote, upsertInvoiceSetupRemote } from "./invoiceSetupRemote";

const sb = vi.hoisted(() => ({
  row: null as { template: unknown; updated_at: string } | null,
  lastUpsert: null as unknown,
}));

function createFrom(table: string) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: sb.row, error: null }),
      }),
    }),
    upsert: (payload: unknown) => {
      sb.lastUpsert = { table, payload };
      return Promise.resolve({ error: null });
    },
  };
}

vi.mock("./supabase", () => ({
  supabase: {
    from: (t: string) => createFrom(t),
  },
}));

const PID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("invoiceSetupRemote (mocked supabase)", () => {
  beforeEach(() => {
    sb.row = null;
    sb.lastUpsert = null;
  });

  it("fetch returns null when no row", async () => {
    const { supabase } = await import("./supabase");
    const r = await fetchInvoiceSetupRemote(supabase, PID);
    expect(r).toBeNull();
  });

  it("fetch maps template through parseInvoiceTemplateJson", async () => {
    sb.row = {
      template: {
        schema_version: INVOICE_SETUP_SCHEMA_VERSION,
        legalName: "Studio X",
        invoicePrefix: "SX",
        paymentTerms: "Net 30",
        accentColor: "#111111",
        footerNote: "Thanks",
        logoDataUrl: null,
      },
      updated_at: "2026-04-20T12:00:00.000Z",
    };
    const { supabase } = await import("./supabase");
    const r = await fetchInvoiceSetupRemote(supabase, PID);
    expect(r?.template.legalName).toBe("Studio X");
    expect(r?.template.invoicePrefix).toBe("SX");
    expect(r?.updatedAt).toBe("2026-04-20T12:00:00.000Z");
  });

  it("upsert sends persisted template with schema_version", async () => {
    const { supabase } = await import("./supabase");
    const s = defaultInvoiceSetup();
    await upsertInvoiceSetupRemote(supabase, PID, s);
    expect(sb.lastUpsert).toMatchObject({
      table: "studio_invoice_setup",
    });
    const payload = (sb.lastUpsert as { payload: { template: Record<string, unknown> } }).payload;
    expect(payload.template).toEqual(toPersistedTemplate(s) as unknown as Record<string, unknown>);
    expect(payload.template.schema_version).toBe(INVOICE_SETUP_SCHEMA_VERSION);
  });
});

describe("parseInvoiceTemplateJson", () => {
  it("returns defaults for garbage", () => {
    const d = defaultInvoiceSetup();
    expect(parseInvoiceTemplateJson(null).legalName).toBe(d.legalName);
    expect(parseInvoiceTemplateJson("x")).toEqual(d);
  });

  it("round-trips toPersistedTemplate minus version field in UI type", () => {
    const s = { ...defaultInvoiceSetup(), legalName: "A", invoicePrefix: "Z" };
    const p = toPersistedTemplate(s);
    const raw = { ...p };
    const out = parseInvoiceTemplateJson(raw);
    expect(out).toEqual(s);
  });
});
