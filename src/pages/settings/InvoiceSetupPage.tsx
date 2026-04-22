import { Link } from "react-router-dom";
import { useInvoiceSetup } from "../../components/modes/settings/InvoiceSetupContext";
import { openAnaWithInvoiceSetupSpecialist } from "../../components/SupportAssistantWidget";

const PRESETS = ["#3b4ed0", "#0d9488", "#b45309", "#1a1c1e"];

export function InvoiceSetupPage() {
  const { setup, setSetup } = useInvoiceSetup();

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

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="mx-auto max-w-md px-8 py-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Invoice PDF setup</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          How invoices look when generated. Changes update the live preview in real time.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/workspace/invoice-setup/proposals"
            className="text-[13px] text-primary underline underline-offset-2 hover:text-foreground/90"
            data-testid="invoice-change-proposals-review-link"
          >
            Change proposals (review)
          </Link>
          <button
            type="button"
            onClick={() => openAnaWithInvoiceSetupSpecialist()}
            className="text-[13px] text-primary underline underline-offset-2 hover:text-foreground/90"
            data-testid="invoice-setup-ask-ana-specialist"
          >
            Ask Ana (invoice template)
          </button>
        </p>
      </div>

      <section className="mt-8">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Branding</h3>
        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Legal / studio name</span>
            <input
              value={setup.legalName}
              onChange={(e) => setSetup((s) => ({ ...s, legalName: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Invoice prefix</span>
            <input
              value={setup.invoicePrefix}
              onChange={(e) => setSetup((s) => ({ ...s, invoicePrefix: e.target.value }))}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Terms</h3>
        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Payment terms</span>
            <input
              value={setup.paymentTerms}
              onChange={(e) => setSetup((s) => ({ ...s, paymentTerms: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Footer note</span>
            <textarea
              value={setup.footerNote}
              onChange={(e) => setSetup((s) => ({ ...s, footerNote: e.target.value }))}
              rows={2}
              className={inputCls + " resize-y"}
            />
          </label>
        </div>
      </section>

      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Appearance</h3>
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-[13px] font-medium text-foreground">Accent color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSetup((s) => ({ ...s, accentColor: c }))}
                  className={
                    "h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-background " +
                    (setup.accentColor === c ? "ring-ring" : "ring-transparent")
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
              className="mt-3 h-10 w-full max-w-[120px] cursor-pointer rounded-lg border border-border"
            />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Logo</p>
            <input type="file" accept="image/*" onChange={onLogoFile} className="mt-2 text-[13px] text-muted-foreground" />
            {setup.logoDataUrl ? (
              <button
                type="button"
                onClick={() => setSetup((s) => ({ ...s, logoDataUrl: null }))}
                className="mt-2 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground"
              >
                Remove logo
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
