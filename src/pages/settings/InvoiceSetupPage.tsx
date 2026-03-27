import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { loadJson, saveJson } from "../../lib/settingsStorage";
import {
  INVOICE_STORAGE_KEY,
  defaultInvoiceSetup,
  type InvoiceSetupState,
} from "../../lib/invoiceSetupTypes";
import { InvoicePdfDocument } from "./InvoicePdfDocument";

const PRESETS = ["#3b4ed0", "#0d9488", "#b45309", "#1a1c1e"];

export function InvoiceSetupPage() {
  const [setup, setSetup] = useState<InvoiceSetupState>(() => loadJson(INVOICE_STORAGE_KEY, defaultInvoiceSetup()));

  useEffect(() => {
    saveJson(INVOICE_STORAGE_KEY, setup);
  }, [setup]);

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length > 900_000) {
        alert("Image too large for demo storage — use a smaller logo.");
        return;
      }
      setSetup((s) => ({ ...s, logoDataUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Invoice PDF setup</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          How invoices look when generated (demo preview). Settings save in this browser.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-ink">Legal / studio name</span>
            <input
              value={setup.legalName}
              onChange={(e) => setSetup((s) => ({ ...s, legalName: e.target.value }))}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-ink">Invoice prefix</span>
            <input
              value={setup.invoicePrefix}
              onChange={(e) => setSetup((s) => ({ ...s, invoicePrefix: e.target.value }))}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-ink">Payment terms</span>
            <input
              value={setup.paymentTerms}
              onChange={(e) => setSetup((s) => ({ ...s, paymentTerms: e.target.value }))}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
          <label className="block space-y-1 text-[13px]">
            <span className="font-semibold text-ink">Footer note</span>
            <textarea
              value={setup.footerNote}
              onChange={(e) => setSetup((s) => ({ ...s, footerNote: e.target.value }))}
              rows={2}
              className="w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
          <div>
            <p className="text-[13px] font-semibold text-ink">Accent color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSetup((s) => ({ ...s, accentColor: c }))}
                  className={
                    "h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface " +
                    (setup.accentColor === c ? "ring-accent" : "ring-transparent")
                  }
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <input
              type="color"
              value={setup.accentColor}
              onChange={(e) => setSetup((s) => ({ ...s, accentColor: e.target.value }))}
              className="mt-3 h-10 w-full max-w-[120px] cursor-pointer rounded border border-border"
            />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink">Logo</p>
            <input type="file" accept="image/*" onChange={onLogoFile} className="mt-2 text-[13px] text-ink-muted" />
            {setup.logoDataUrl ? (
              <button
                type="button"
                onClick={() => setSetup((s) => ({ ...s, logoDataUrl: null }))}
                className="mt-2 text-[12px] font-semibold text-accent"
              >
                Remove logo
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-[520px] flex-col rounded-2xl border border-border bg-canvas/50 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Live preview</p>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-white">
            <PDFViewer width="100%" height="100%" showToolbar={false} className="h-[480px]">
              <InvoicePdfDocument setup={setup} />
            </PDFViewer>
          </div>
        </div>
      </div>
    </div>
  );
}
