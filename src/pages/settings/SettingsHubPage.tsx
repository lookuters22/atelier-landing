import { Link } from "react-router-dom";
import { ArrowRight, LayoutTemplate } from "lucide-react";

export type SettingsHubPageProps = {
  /** When false, hides the cross-link to the manager shell (used from `/manager/settings`). */
  showManagerPreviewLink?: boolean;
};

export function SettingsHubPage({ showManagerPreviewLink = true }: SettingsHubPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Studio profile, integrations, notifications, and tools for pricing, invoices, and HTML offers.
        </p>
        {showManagerPreviewLink ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            <Link to="/manager/today" className="font-semibold text-accent hover:text-accent-hover">
              Studio manager preview
            </Link>
            {" — "}multi-photographer overview and team filtering (demo).
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">General</p>
        <p className="mt-1 text-[13px] text-ink-muted">Studio identity and connectivity.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Display name</span>
            <input
              defaultValue="Atelier · Elena Duarte"
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="space-y-2 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Default currency</span>
            <input
              defaultValue="EUR"
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>

        <div className="mt-8 border-t border-border/70 pt-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Integrations</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-4 py-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">Google Workspace</p>
                <p className="text-[13px] text-ink-muted">Gmail + Calendar — last sync 2 minutes ago</p>
              </div>
              <span className="rounded-full bg-lime/20 px-3 py-1 text-[12px] font-semibold text-ink">Connected</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-4 py-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">WhatsApp approvals</p>
                <p className="text-[13px] text-ink-muted">Route drafts to your phone when you are on location</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink hover:border-accent/30"
              >
                Connect
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border/70 pt-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Notifications</p>
          <div className="mt-4 space-y-3 text-[13px] text-ink-muted">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
              <span className="font-semibold text-ink">Drafts awaiting approval</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
              <span className="font-semibold text-ink">Unfiled messages digest</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">AI & tone</p>
        <p className="mt-2 text-[13px] text-ink-muted">
          Upload a short style guide—Atelier retrieves it before drafting. Negative constraints (no discounts, no
          delivery promises) are enforced in the orchestration layer.
        </p>
        <div className="mt-4">
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-border bg-canvas px-4 py-6 text-left text-[13px] font-semibold text-ink-muted hover:border-accent/40 md:max-w-md"
          >
            Upload tone examples
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Studio tools</p>
        <p className="mt-2 text-[13px] text-ink-muted">Configure pricing, invoice appearance, and pricing offers as HTML.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/settings/pricing-calculator"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface"
          >
            <span className="text-[14px] font-semibold text-ink group-hover:text-accent">Pricing calculator</span>
            <span className="mt-1 text-[12px] text-ink-muted">Packages, add-ons, sample totals</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
          <Link
            to="/settings/invoices"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface"
          >
            <span className="text-[14px] font-semibold text-ink group-hover:text-accent">Invoice PDF setup</span>
            <span className="mt-1 text-[12px] text-ink-muted">Branding, terms, live preview</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
          <Link
            to="/settings/offer-builder"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface sm:col-span-2 lg:col-span-1"
          >
            <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink group-hover:text-accent">
              <LayoutTemplate className="h-4 w-4" strokeWidth={1.75} />
              Pricing offer builder
            </span>
            <span className="mt-1 text-[12px] text-ink-muted">HTML editor, preview, download</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
