import type { UiState } from "@measured/puck";

/** Passed to `<Puck viewports={...} />` (viewport presets). */
export const OFFER_PUCK_VIEWPORTS = [
  { width: 360, height: "auto" as const, icon: "Smartphone", label: "Small" },
  { width: 768, height: "auto" as const, icon: "Tablet", label: "Medium" },
  { width: 1280, height: "auto" as const, icon: "Monitor", label: "Large" },
];

/** Full `ui.viewports` so merging with Puck defaults does not drop `current` / `options`. */
export const OFFER_PUCK_UI_VIEWPORTS: UiState["viewports"] = {
  current: { width: 1280, height: "auto" },
  options: OFFER_PUCK_VIEWPORTS,
  controlsVisible: true,
};
