import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { loadJson, saveJson } from "../../lib/settingsStorage";
import {
  PRICING_STORAGE_KEY,
  defaultPricingState,
  type PricingAddOn,
  type PricingCalculatorState,
  type PricingPackage,
} from "../../lib/pricingCalculatorTypes";

function newId(): string {
  return crypto.randomUUID();
}

export function PricingCalculatorPage() {
  const [state, setState] = useState<PricingCalculatorState>(() => loadJson(PRICING_STORAGE_KEY, defaultPricingState()));

  useEffect(() => {
    saveJson(PRICING_STORAGE_KEY, state);
  }, [state]);

  const selected = useMemo(
    () => state.packages.find((p) => p.id === state.selectedPackageId) ?? state.packages[0] ?? null,
    [state.packages, state.selectedPackageId],
  );

  const sampleTotal = useMemo(() => {
    if (!selected) return 0;
    return selected.basePrice;
  }, [selected]);

  const updatePackage = useCallback((id: string, patch: Partial<PricingPackage>) => {
    setState((s) => ({
      ...s,
      packages: s.packages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const addPackage = useCallback(() => {
    const p: PricingPackage = {
      id: newId(),
      name: "New package",
      hours: 8,
      basePrice: 5000,
      currency: "EUR",
      addOns: [],
    };
    setState((s) => ({ ...s, packages: [...s.packages, p], selectedPackageId: p.id }));
  }, []);

  const removePackage = useCallback((id: string) => {
    setState((s) => {
      const next = s.packages.filter((p) => p.id !== id);
      return {
        ...s,
        packages: next,
        selectedPackageId: next.some((p) => p.id === s.selectedPackageId) ? s.selectedPackageId : next[0]?.id ?? null,
      };
    });
  }, []);

  const addOn = useCallback((packageId: string) => {
    const row: PricingAddOn = { id: newId(), label: "Add-on", price: 500 };
    setState((s) => ({
      ...s,
      packages: s.packages.map((p) => (p.id === packageId ? { ...p, addOns: [...p.addOns, row] } : p)),
    }));
  }, []);

  const updateAddOn = useCallback((packageId: string, addOnId: string, patch: Partial<PricingAddOn>) => {
    setState((s) => ({
      ...s,
      packages: s.packages.map((p) =>
        p.id === packageId
          ? { ...p, addOns: p.addOns.map((a) => (a.id === addOnId ? { ...a, ...patch } : a)) }
          : p,
      ),
    }));
  }, []);

  const removeAddOn = useCallback((packageId: string, addOnId: string) => {
    setState((s) => ({
      ...s,
      packages: s.packages.map((p) =>
        p.id === packageId ? { ...p, addOns: p.addOns.filter((a) => a.id !== addOnId) } : p,
      ),
    }));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Pricing calculator</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Define packages and add-ons. Totals save to this browser (demo). Use the sample strip to sanity-check numbers.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-accent/[0.06] px-4 py-3 text-[13px] text-ink-muted">
        <span className="font-semibold text-ink">Sample wedding total</span>
        {selected ? (
          <>
            {" "}
            — base {selected.currency} {selected.basePrice.toLocaleString()}
            {selected.addOns.length ? ` + ${selected.addOns.length} add-on(s)` : ""} ·{" "}
            <span className="font-semibold text-ink">
              {selected.currency}{" "}
              {(sampleTotal + selected.addOns.reduce((s, a) => s + a.price, 0)).toLocaleString()}
            </span>
          </>
        ) : (
          " — add a package below."
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addPackage}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-accent/40"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add package
        </button>
      </div>

      <div className="space-y-4">
        {state.packages.map((pkg) => (
          <div
            key={pkg.id}
            className={
              "rounded-2xl border bg-surface p-5 shadow-sm " +
              (state.selectedPackageId === pkg.id ? "border-accent/40 ring-1 ring-accent/15" : "border-border")
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, selectedPackageId: pkg.id }))}
                className="text-left text-[15px] font-semibold text-ink hover:text-accent"
              >
                {pkg.name}
              </button>
              <button
                type="button"
                onClick={() => removePackage(pkg.id)}
                className="rounded-full p-1.5 text-ink-faint hover:bg-black/[0.04] hover:text-ink"
                aria-label="Remove package"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-[13px]">
                <span className="text-ink-muted">Name</span>
                <input
                  value={pkg.name}
                  onChange={(e) => updatePackage(pkg.id, { name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                />
              </label>
              <label className="space-y-1 text-[13px]">
                <span className="text-ink-muted">Hours</span>
                <input
                  type="number"
                  min={1}
                  value={pkg.hours}
                  onChange={(e) => updatePackage(pkg.id, { hours: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                />
              </label>
              <label className="space-y-1 text-[13px]">
                <span className="text-ink-muted">Base price</span>
                <input
                  type="number"
                  min={0}
                  value={pkg.basePrice}
                  onChange={(e) => updatePackage(pkg.id, { basePrice: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                />
              </label>
              <label className="space-y-1 text-[13px]">
                <span className="text-ink-muted">Currency</span>
                <input
                  value={pkg.currency}
                  onChange={(e) => updatePackage(pkg.id, { currency: e.target.value })}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                />
              </label>
            </div>

            <div className="mt-6 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Add-ons</p>
              <ul className="mt-2 space-y-2">
                {pkg.addOns.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[140px] flex-1 space-y-1 text-[13px]">
                      <span className="text-ink-muted">Label</span>
                      <input
                        value={a.label}
                        onChange={(e) => updateAddOn(pkg.id, a.id, { label: e.target.value })}
                        className="w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px]"
                      />
                    </label>
                    <label className="w-28 space-y-1 text-[13px]">
                      <span className="text-ink-muted">Price</span>
                      <input
                        type="number"
                        min={0}
                        value={a.price}
                        onChange={(e) => updateAddOn(pkg.id, a.id, { price: Number(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px]"
                      />
                    </label>
                    <button
                      type="button"
                      className="mb-0.5 rounded-full p-1.5 text-ink-faint hover:bg-black/[0.04]"
                      onClick={() => removeAddOn(pkg.id, a.id)}
                      aria-label="Remove add-on"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => addOn(pkg.id)}
                className="mt-2 text-[12px] font-semibold text-accent hover:text-accent-hover"
              >
                + Add add-on
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
