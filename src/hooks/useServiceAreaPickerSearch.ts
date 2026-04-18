import { useEffect, useMemo, useState } from "react";
import { ServiceAreaDatasetLoadError, loadServiceAreaLabels } from "@/lib/serviceAreaPicker/serviceAreaDatasetLoader.ts";
import {
  buildServiceAreaSearchIndex,
  searchServiceAreaIndex,
  type SearchServiceAreaIndexOpts,
  type ServiceAreaSearchIndex,
} from "@/lib/serviceAreaPicker/serviceAreaSearchIndex.ts";
import {
  CONTINENT_DEFS,
  WORLDWIDE_DEF,
} from "@/lib/serviceAreaPicker/serviceAreaContinents.ts";
import type {
  ServiceAreaLabelsBundle,
  ServiceAreaSearchResult,
} from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";

export type UseServiceAreaPickerSearchArgs = {
  query: string;
  limit?: number;
  biasCountryCode?: string;
};

/**
 * Fixed "try one of these" shortlist shown when the operator opens the
 * search with an empty query. Order is deliberate: the broadest
 * (Worldwide / Europe) first, then three concrete example countries
 * so the list reads as "pick something big or drill into a country".
 */
const DEFAULT_SUGGESTION_COUNTRY_ISO2 = ["US", "IT", "FR"] as const;

function resolveCountrySuggestion(
  bundle: ServiceAreaLabelsBundle,
  iso2: string,
): ServiceAreaSearchResult | null {
  const hit = bundle.countries.find((c) => c.iso2 === iso2);
  if (!hit) return null;
  return {
    provider_id: hit.id,
    label: hit.label,
    kind: "country",
    centroid: hit.centroid,
    bbox: hit.bbox,
    country_code: hit.iso2,
  };
}

function buildDefaultSuggestions(
  bundle: ServiceAreaLabelsBundle,
): ServiceAreaSearchResult[] {
  const out: ServiceAreaSearchResult[] = [];
  out.push({
    provider_id: WORLDWIDE_DEF.id,
    label: WORLDWIDE_DEF.label,
    kind: "worldwide",
    centroid: WORLDWIDE_DEF.centroid,
    bbox: WORLDWIDE_DEF.bbox,
  });
  const europe = CONTINENT_DEFS.find((c) => c.id === "ne:continent:europe");
  if (europe) {
    out.push({
      provider_id: europe.id,
      label: europe.label,
      kind: "continent",
      centroid: europe.centroid,
      bbox: europe.bbox,
    });
  }
  for (const iso of DEFAULT_SUGGESTION_COUNTRY_ISO2) {
    const s = resolveCountrySuggestion(bundle, iso);
    if (s) out.push(s);
  }
  return out;
}

export function useServiceAreaPickerSearch({
  query,
  limit = 8,
  biasCountryCode,
}: UseServiceAreaPickerSearchArgs): {
  results: ServiceAreaSearchResult[];
  suggestions: ServiceAreaSearchResult[];
  isLoading: boolean;
  error: Error | null;
} {
  const [index, setIndex] = useState<ServiceAreaSearchIndex | null>(null);
  const [bundle, setBundle] = useState<ServiceAreaLabelsBundle | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadServiceAreaLabels()
      .then((loaded) => {
        if (cancelled) return;
        setIndex(buildServiceAreaSearchIndex(loaded));
        setBundle(loaded);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new ServiceAreaDatasetLoadError(String(e), ""));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opts = useMemo<SearchServiceAreaIndexOpts>(
    () => ({ limit, biasCountryCode }),
    [limit, biasCountryCode],
  );

  const results = useMemo(() => {
    if (!index) return [];
    return searchServiceAreaIndex(index, query, opts);
  }, [index, query, opts]);

  const suggestions = useMemo(() => {
    if (!bundle) return [];
    return buildDefaultSuggestions(bundle);
  }, [bundle]);

  return {
    results,
    suggestions,
    isLoading: index === null && error === null,
    error,
  };
}
