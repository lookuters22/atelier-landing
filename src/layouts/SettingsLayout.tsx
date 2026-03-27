import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Calculator, FileText, LayoutTemplate, Settings2 } from "lucide-react";
import { OfferBuilderSettingsProvider } from "../pages/settings/offerBuilderSettingsContext";

const links = [
  { to: "/settings", label: "General", icon: Settings2, end: true },
  { to: "/settings/pricing-calculator", label: "Pricing calculator", icon: Calculator, end: false },
  { to: "/settings/invoices", label: "Invoice PDF", icon: FileText, end: false },
  { to: "/settings/offer-builder", label: "Offer builder", icon: LayoutTemplate, end: false },
];

const OFFER_BUILDER_EDITOR_PREFIX = "/settings/offer-builder/edit";

export function SettingsLayout() {
  const { pathname } = useLocation();
  const isOfferBuilderEditor = pathname.startsWith(OFFER_BUILDER_EDITOR_PREFIX);

  const inner = (
    <div
      className={
        "mx-auto flex w-full max-w-none flex-1 flex-col min-h-0 " +
        (isOfferBuilderEditor ? "h-full gap-0 lg:min-h-0 lg:flex-row lg:items-stretch" : "gap-6 lg:flex-row lg:items-start")
      }
    >
      <div
        className={
          "z-[5] flex min-h-0 shrink-0 flex-col " +
          (isOfferBuilderEditor
            ? "min-h-[min(40vh,320px)] w-full self-stretch border-b border-border bg-surface lg:h-full lg:min-h-0 lg:w-[18rem] lg:border-b-0 lg:border-r"
            : "lg:sticky lg:top-0 lg:w-52 lg:self-start")
        }
      >
        {isOfferBuilderEditor ? (
          <OfferBuilderSettingsProvider value={{ paletteMountVersion: 0 }}>
            <nav className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <div
                id="offer-builder-palette-root"
                className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-full"
              />
            </nav>
          </OfferBuilderSettingsProvider>
        ) : (
          <nav className="flex min-h-0 min-w-0 flex-1 flex-col lg:h-full">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Settings</p>
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {links.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                        isActive ? "bg-surface text-ink ring-1 ring-border shadow-sm" : "text-ink-muted hover:bg-black/[0.03] hover:text-ink",
                      ].join(" ")
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );

  return inner;
}
