export type PricingAddOn = {
  id: string;
  label: string;
  price: number;
};

export type PricingPackage = {
  id: string;
  name: string;
  hours: number;
  basePrice: number;
  currency: string;
  addOns: PricingAddOn[];
};

export type PricingCalculatorState = {
  packages: PricingPackage[];
  selectedPackageId: string | null;
};

export const PRICING_STORAGE_KEY = "atelier-pricing-calculator";

export function defaultPricingState(): PricingCalculatorState {
  return {
    selectedPackageId: null,
    packages: [
      {
        id: "pkg-1",
        name: "Full day editorial",
        hours: 10,
        basePrice: 8500,
        currency: "EUR",
        addOns: [
          { id: "a1", label: "Second shooter (6h)", price: 1200 },
          { id: "a2", label: "Rehearsal dinner", price: 800 },
        ],
      },
      {
        id: "pkg-2",
        name: "Weekend + rehearsal",
        hours: 16,
        basePrice: 14500,
        currency: "EUR",
        addOns: [{ id: "a3", label: "Album design", price: 600 }],
      },
    ],
  };
}
