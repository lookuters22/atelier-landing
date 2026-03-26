import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { listFinancialsOverview, type FinancialsOverviewRow } from "../data/weddingFinancials";

type Filter = "all" | "proposal" | "contract" | "invoice";

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "sent" || s === "draft") return "bg-amber-500/15 text-amber-800";
  if (s === "accepted" || s === "signed" || s === "paid") return "bg-emerald-500/15 text-emerald-800";
  if (s === "partial") return "bg-sky-500/15 text-sky-800";
  if (s === "overdue" || s === "expired" || s === "void") return "bg-rose-500/15 text-rose-800";
  return "bg-ink/5 text-ink-muted";
}

function kindLabel(kind: FinancialsOverviewRow["kind"]): string {
  if (kind === "proposal") return "Proposal";
  if (kind === "contract") return "Contract";
  return "Invoice";
}

export function FinancialsPage() {
  const allRows = useMemo(() => listFinancialsOverview(), []);
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (filter === "all") return allRows;
    return allRows.filter((r) => r.kind === filter);
  }, [allRows, filter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-ink-faint">
            <Wallet className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Studio</span>
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Financials</h1>
          <p className="mt-1 max-w-xl text-[13px] text-ink-muted">
            Proposals, contracts, and invoices across weddings (demo data). Open a wedding to see the full Money & docs tab.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["proposal", "Proposals"],
            ["contract", "Contracts"],
            ["invoice", "Invoices"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition " +
              (filter === id ? "bg-ink text-canvas" : "bg-canvas text-ink-muted ring-1 ring-border hover:bg-black/[0.03]")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border bg-canvas/50 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Wedding</th>
              <th className="px-4 py-3">Title</th>
              <th className="hidden px-4 py-3 sm:table-cell">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="hidden px-4 py-3 md:table-cell">Notes</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-ink-muted">
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{kindLabel(r.kind)}</td>
                  <td className="px-4 py-3 text-ink">{r.couple}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-ink-muted" title={r.title}>
                    {r.title}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{r.amountLabel ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + statusPill(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="hidden max-w-[220px] truncate px-4 py-3 text-[12px] text-ink-faint md:table-cell" title={r.meta}>
                    {r.meta ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/wedding/${r.weddingId}?tab=financials`}
                      className="text-[12px] font-semibold text-accent hover:text-accent-hover"
                    >
                      Open wedding
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
