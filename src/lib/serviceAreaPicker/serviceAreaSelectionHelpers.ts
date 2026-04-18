import type { BusinessScopeServiceArea } from "./serviceAreaPickerTypes.ts";
import type { ServiceAreaSearchResult } from "./serviceAreaPickerTypes.ts";

export function bundledResultToServiceArea(result: ServiceAreaSearchResult): BusinessScopeServiceArea {
  return {
    provider_id: result.provider_id,
    label: result.label,
    kind: result.kind,
    provider: "bundled",
    centroid: result.centroid,
    bbox: result.bbox,
    ...(result.country_code ? { country_code: result.country_code } : {}),
    selected_at: new Date().toISOString(),
  };
}

export function customAreaToServiceArea(
  label: string,
  centroid: [number, number],
  bbox: [number, number, number, number],
): BusinessScopeServiceArea {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    provider_id: `custom:${slug || "area"}`,
    label: label.trim(),
    kind: "custom",
    provider: "custom",
    centroid,
    bbox,
    selected_at: new Date().toISOString(),
  };
}
