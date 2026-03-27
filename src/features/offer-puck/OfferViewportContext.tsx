import { createContext, useContext, type ReactNode } from "react";

const OfferViewportWidthContext = createContext<number | null>(null);

type OfferViewportProviderProps = {
  width: number;
  children: ReactNode;
};

export function OfferViewportProvider({ width, children }: OfferViewportProviderProps) {
  return (
    <OfferViewportWidthContext.Provider value={width}>{children}</OfferViewportWidthContext.Provider>
  );
}

export function useOfferViewportWidth() {
  return useContext(OfferViewportWidthContext);
}
