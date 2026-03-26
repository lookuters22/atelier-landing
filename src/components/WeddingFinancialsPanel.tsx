import { getFinancialsForWedding } from "../data/weddingFinancials";

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "sent" || s === "draft") return "bg-amber-500/15 text-amber-800";
  if (s === "accepted" || s === "signed" || s === "paid") return "bg-emerald-500/15 text-emerald-800";
  if (s === "partial") return "bg-sky-500/15 text-sky-800";
  if (s === "overdue" || s === "expired" || s === "void") return "bg-rose-500/15 text-rose-800";
  return "bg-ink/5 text-ink-muted";
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function WeddingFinancialsPanel({ weddingId }: { weddingId: string }) {
  const { proposals, contracts, invoices } = getFinancialsForWedding(weddingId);
  const empty = proposals.length === 0 && contracts.length === 0 && invoices.length === 0;

  if (empty) {
    return (
      <p className="text-[13px] text-ink-muted">
        No proposals, contracts, or invoices for this wedding yet (demo). Custom weddings stay empty until you add persistence.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {proposals.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Proposals</h3>
          <ul className="mt-2 space-y-2">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">{p.title}</p>
                  <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + statusPill(p.status)}>
                    {p.status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {fmtMoney(p.amount, p.currency)} · v{p.version}
                  {p.sentAt ? ` · sent ${p.sentAt}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {contracts.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Contracts</h3>
          <ul className="mt-2 space-y-2">
            {contracts.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">{c.title}</p>
                  <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + statusPill(c.status)}>
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">{c.counterparty}</p>
                {c.signedAt ? <p className="mt-0.5 text-[12px] text-ink-faint">Signed {c.signedAt}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {invoices.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Invoices</h3>
          <ul className="mt-2 space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">{inv.label}</p>
                  <span className={"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + statusPill(inv.status)}>
                    {inv.status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {fmtMoney(inv.amount, inv.currency)} · due {inv.dueDate}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
