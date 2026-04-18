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
import {
  ContextPaneRoot,
  PaneCountBadge,
  PaneNavRow,
  PaneScrollRegion,
  PaneSectionLabel,
} from "@/components/panes";
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
    <ContextPaneRoot>
      <PaneScrollRegion>
        <div className="space-y-5">
          <Section label="Financials" items={FINANCIAL_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
          <Section label="Sales" items={SALES_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
          <Section label="Studio Tools" items={TOOL_ITEMS} activeIndex={effectiveIndex} counts={counts} onSelect={handleSelect} />
        </div>
      </PaneScrollRegion>
    </ContextPaneRoot>
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
    <div>
      <PaneSectionLabel>{label}</PaneSectionLabel>
      {items.map((item) => (
        <PaneNavRow
          key={item.id}
          active={activeIndex === item.id}
          icon={item.icon}
          onClick={() => onSelect(item)}
          endAdornment={
            item.showCount === false || !counts[item.id]
              ? undefined
              : counts[item.id] > 0
                ? <PaneCountBadge>{counts[item.id]}</PaneCountBadge>
                : undefined
          }
        >
          {item.label}
        </PaneNavRow>
      ))}
    </div>
  );
}
