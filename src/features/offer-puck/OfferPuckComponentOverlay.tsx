import type { ReactNode } from "react";

type OfferPuckComponentOverlayProps = {
  children: ReactNode;
  hover: boolean;
  isSelected: boolean;
  componentId: string;
  componentType: string;
};

export function OfferPuckComponentOverlay({ children }: OfferPuckComponentOverlayProps) {
  return <>{children}</>;
}
