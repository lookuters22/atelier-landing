import { createContext, useContext, type ReactNode } from "react";

export type OfferBuilderSettingsContextValue = {
  /** Bumps when the palette DOM mount moves so portals can rebind. */
  paletteMountVersion: number;
};

const OfferBuilderSettingsContext = createContext<OfferBuilderSettingsContextValue | null>(null);

export function OfferBuilderSettingsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: OfferBuilderSettingsContextValue;
}) {
  return <OfferBuilderSettingsContext.Provider value={value}>{children}</OfferBuilderSettingsContext.Provider>;
}

export function useOfferBuilderSettings() {
  const ctx = useContext(OfferBuilderSettingsContext);
  return ctx;
}
