import type { GeographyScopeMode } from "@/lib/onboardingBusinessScopeDeterministic.ts";
import { ScopeSectorCluster } from "@/components/onboarding/ScopeSectorCluster.tsx";

export type GeographySectorClusterProps = {
  modes: readonly GeographyScopeMode[];
  labels: Record<GeographyScopeMode, string>;
  selected: GeographyScopeMode;
  onSelect: (m: GeographyScopeMode) => void;
};

export function GeographySectorCluster({ modes, labels, selected, onSelect }: GeographySectorClusterProps) {
  return (
    <ScopeSectorCluster<GeographyScopeMode>
      itemIds={modes}
      getLabel={(m) => labels[m]}
      isSelected={(m) => selected === m}
      onActivate={onSelect}
      phaseShift={0}
      layoutGroupId="geography-sector-donut"
      roleRadio
      role="radiogroup"
      aria-label="Geography scope"
    />
  );
}
