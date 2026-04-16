import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  FileSignature,
  ScrollText,
  Calculator,
  Package,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceMode, type WorkspaceIndex } from "./WorkspaceModeContext";

type NavItem = { id: WorkspaceIndex; label: string; icon: typeof FileText; showCount?: boolean; route?: string };

const FINANCIAL_ITEMS: NavItem[] = [
  { id: "fin-overview", label: "Overview", icon: LayoutDashboard, showCount: false },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
];

const SALES_ITEMS: NavItem[] = [
  { id: "proposals", label: "Proposals", icon: ScrollText },
  { id: "contracts", label: "Contracts", icon: FileSignature },
];

const TOOL_ITEMS: NavItem[] = [
  { id: "pricing-calculator", label: "Pricing Calculator", icon: Calculator, showCount: false, route: "/workspace/pricing-calculator" },
  { id: "offer-builder", label: "Offer Builder", icon: Package, showCount: false, route: "/workspace/offer-builder" },
  { id: "invoice-pdf", label: "Invoice PDF Setup", icon: Receipt, showCount: false, route: "/workspace/invoices" },
];

export function WorkspaceContextList() {
  const { activeIndex, setActiveIndex, counts } = useWorkspaceMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const effectiveIndex = resolveActiveIndex(activeIndex, pathname);

  function handleSelect(item: NavItem) {
    setActiveIndex(item.id);
    if (item.route) {
      navigate(item.route);
    } else if (pathname !== "/workspace") {
      navigate("/workspace");
    }
  }

  return (
    <div className="dashboard-context-pane flex h-full min-h-0 flex-col border-r border-border text-[13px] text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <Section label="Financials" items={FINANCIAL_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
        <Section label="Sales" items={SALES_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
        <Section label="Studio Tools" items={TOOL_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
      </div>
    </div>
  );
}

function resolveActiveIndex(ctxIndex: WorkspaceIndex, pathname: string): WorkspaceIndex {
  if (pathname.startsWith("/workspace/pricing-calculator")) return "pricing-calculator";
  if (pathname.startsWith("/workspace/offer-builder")) return "offer-builder";
  if (pathname.startsWith("/workspace/invoices")) return "invoice-pdf";
  return ctxIndex;
}

function Section({
  label,
  items,
  activeIndex,
  counts,
  onSelect,
}: {
  label: string;
  items: NavItem[];
  activeIndex: WorkspaceIndex;
  counts: Record<string, number>;
  onSelect: (item: NavItem) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {items.map((item) => (
        <NavRow
          key={item.id}
          label={item.label}
          icon={item.icon}
          active={activeIndex === item.id}
          count={item.showCount === false ? undefined : counts[item.id]}
          onClick={() => onSelect(item)}
        />
      ))}
    </div>
  );
}

function NavRow({
  label,
  icon: Icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon: typeof FileText;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
        active ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0 text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}
