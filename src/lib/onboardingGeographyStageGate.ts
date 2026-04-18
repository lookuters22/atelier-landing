/**
 * Pure predicate for the onboarding geography stage (`service_areas`).
 *
 * The stage is a *two-phase* capture on a single screen:
 *
 *   Phase 1 — "Where are you based?"  → writes `photographers.settings.base_location`
 *   Phase 2 — "Where do you want to show up?" → writes
 *     `studio_business_profiles.extensions.service_areas`
 *
 * Both halves are **required** before the operator can advance. Previously
 * the gate only enforced the base half, which let operators finalize
 * onboarding with an empty `service_areas` — violating the stage's own
 * copy ("pick the cities, regions, and countries you actively want to
 * book in") and leaving the runtime with no geographic coverage signal.
 *
 * Extracted as a pure function so the gating rule is unit-testable
 * without rendering the whole scope step.
 */
import type { StudioBaseLocation } from "./studioBaseLocation.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";

export type GeographyStageGateInput = {
  baseLocation: StudioBaseLocation | null | undefined;
  serviceAreas: readonly BusinessScopeServiceArea[] | null | undefined;
};

/**
 * Returns `true` iff the operator has answered *both* geography questions:
 * a home base is set and at least one service area is picked.
 */
export function canAdvanceGeographyStage(input: GeographyStageGateInput): boolean {
  const { baseLocation, serviceAreas } = input;
  if (!baseLocation) return false;
  if (!serviceAreas || serviceAreas.length === 0) return false;
  return true;
}
