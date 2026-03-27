import { IconButton } from "@measured/puck";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { OFFER_PUCK_VIEWPORTS } from "./puckDefaultViewports";

const iconMap = {
  Smartphone,
  Tablet,
  Monitor,
} as const;

type OfferViewportControlsProps = {
  currentViewportWidth: number;
  onChange: (width: number) => void;
};

/**
 * Puck hides built-in viewport controls when `iframe={{ enabled: false }}`.
 * These controls drive the inline preview width simulation instead.
 */
export function OfferViewportControls({ currentViewportWidth, onChange }: OfferViewportControlsProps) {
  return (
    <div
      className="PuckCanvas-controls offer-puck-viewport-fallback puck-device-controls"
      role="toolbar"
      aria-label="Preview width"
    >
      {OFFER_PUCK_VIEWPORTS.map((vp, i) => {
        const Icon = typeof vp.icon === "string" ? iconMap[vp.icon as keyof typeof iconMap] : null;
        const active = currentViewportWidth === vp.width;
        return (
          <IconButton
            key={i}
            type="button"
            title={vp.label ? `Switch to ${vp.label} viewport` : "Switch viewport"}
            variant={active ? "primary" : "secondary"}
            onClick={() => onChange(vp.width)}
          >
            {Icon ? <Icon size={16} strokeWidth={1.75} /> : null}
          </IconButton>
        );
      })}
    </div>
  );
}
