import type { WeddingId } from "./weddingCatalog";
import { WEDDING_CATALOG, WEDDING_IDS } from "./weddingCatalog";

export type ProposalStatus = "draft" | "sent" | "accepted" | "expired";

export type FinancialProposal = {
  id: string;
  weddingId: string;
  title: string;
  amount: number;
  currency: string;
  status: ProposalStatus;
  sentAt?: string;
  version: number;
};

export type ContractStatus = "draft" | "sent" | "signed" | "void";

export type FinancialContract = {
  id: string;
  weddingId: string;
  title: string;
  status: ContractStatus;
  signedAt?: string;
  counterparty: string;
};

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue";

export type FinancialInvoice = {
  id: string;
  weddingId: string;
  label: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: InvoiceStatus;
};

export type WeddingFinancialsBundle = {
  proposals: FinancialProposal[];
  contracts: FinancialContract[];
  invoices: FinancialInvoice[];
};

export const WEDDING_FINANCIALS: Record<WeddingId, WeddingFinancialsBundle> = {
  "lake-como": {
    proposals: [
      {
        id: "p-lc-1",
        weddingId: "lake-como",
        title: "Weekend editorial + rehearsal",
        amount: 18500,
        currency: "EUR",
        status: "accepted",
        sentAt: "2025-11-01",
        version: 2,
      },
    ],
    contracts: [
      {
        id: "c-lc-1",
        weddingId: "lake-como",
        title: "Photography services agreement",
        status: "signed",
        signedAt: "2025-11-15",
        counterparty: "Sofia Rossi & Marco Bianchi",
      },
    ],
    invoices: [
      {
        id: "i-lc-1",
        weddingId: "lake-como",
        label: "Deposit — 40%",
        amount: 7400,
        currency: "EUR",
        dueDate: "2025-11-20",
        status: "paid",
      },
      {
        id: "i-lc-2",
        weddingId: "lake-como",
        label: "Balance — Net-15 post-event",
        amount: 4200,
        currency: "EUR",
        dueDate: "2026-06-29",
        status: "sent",
      },
    ],
  },
  santorini: {
    proposals: [
      {
        id: "p-s-1",
        weddingId: "santorini",
        title: "Two-day island coverage",
        amount: 14200,
        currency: "GBP",
        status: "sent",
        sentAt: "2026-02-10",
        version: 1,
      },
    ],
    contracts: [
      {
        id: "c-s-1",
        weddingId: "santorini",
        title: "Master services agreement",
        status: "sent",
        counterparty: "Amelia Chen & James Wright",
      },
    ],
    invoices: [
      {
        id: "i-s-1",
        weddingId: "santorini",
        label: "50% on signature",
        amount: 7100,
        currency: "GBP",
        dueDate: "2026-03-01",
        status: "partial",
      },
    ],
  },
  london: {
    proposals: [
      {
        id: "p-l-1",
        weddingId: "london",
        title: "City editorial + tented reception",
        amount: 9800,
        currency: "GBP",
        status: "sent",
        sentAt: "2026-03-01",
        version: 1,
      },
      {
        id: "p-l-2",
        weddingId: "london",
        title: "Add-on: second shooter (ceremony)",
        amount: 1200,
        currency: "GBP",
        status: "draft",
        version: 1,
      },
    ],
    contracts: [],
    invoices: [],
  },
};

export function getFinancialsForWedding(weddingId: string): WeddingFinancialsBundle {
  const b = WEDDING_FINANCIALS[weddingId as WeddingId];
  if (b) return b;
  return { proposals: [], contracts: [], invoices: [] };
}

export type FinancialsRowKind = "proposal" | "contract" | "invoice";

export type FinancialsOverviewRow = {
  kind: FinancialsRowKind;
  id: string;
  weddingId: string;
  couple: string;
  title: string;
  status: string;
  amountLabel?: string;
  meta?: string;
};

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Studio-wide rows for the Financials hub (demo; built-in weddings only). */
export function listFinancialsOverview(): FinancialsOverviewRow[] {
  const rows: FinancialsOverviewRow[] = [];
  for (const id of WEDDING_IDS) {
    const couple = WEDDING_CATALOG[id].couple;
    const b = WEDDING_FINANCIALS[id];
    for (const p of b.proposals) {
      rows.push({
        kind: "proposal",
        id: p.id,
        weddingId: id,
        couple,
        title: p.title,
        status: p.status,
        amountLabel: fmtMoney(p.amount, p.currency),
        meta: p.sentAt ? `Sent ${p.sentAt} · v${p.version}` : `Draft · v${p.version}`,
      });
    }
    for (const c of b.contracts) {
      rows.push({
        kind: "contract",
        id: c.id,
        weddingId: id,
        couple,
        title: c.title,
        status: c.status,
        meta: c.signedAt ? `Signed ${c.signedAt}` : c.counterparty,
      });
    }
    for (const inv of b.invoices) {
      rows.push({
        kind: "invoice",
        id: inv.id,
        weddingId: id,
        couple,
        title: inv.label,
        status: inv.status,
        amountLabel: fmtMoney(inv.amount, inv.currency),
        meta: `Due ${inv.dueDate}`,
      });
    }
  }
  return rows;
}
