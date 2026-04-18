/**
 * Service area map picker — shared types (bundled dataset + onboarding storage).
 */

export type BusinessScopeServiceAreaKind =
  | "worldwide"
  | "continent"
  | "country"
  | "region"
  | "city"
  | "custom";

export type BusinessScopeServiceAreaProvider = "bundled" | "custom";

export type BusinessScopeServiceArea = {
  provider_id: string;
  label: string;
  kind: BusinessScopeServiceAreaKind;
  provider: BusinessScopeServiceAreaProvider;
  centroid: [number, number];
  bbox: [number, number, number, number];
  country_code?: string;
  selected_at: string;
};

export type ServiceAreaSearchResult = {
  provider_id: string;
  label: string;
  kind: BusinessScopeServiceAreaKind;
  centroid: [number, number];
  bbox: [number, number, number, number];
  country_code?: string;
  population?: number;
};

export type ServiceAreaCountryLabel = {
  id: string;
  label: string;
  iso2: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
};

export type ServiceAreaRegionLabel = {
  id: string;
  label: string;
  iso2: string;
  admin_label?: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
};

export type ServiceAreaCityLabel = {
  id: string;
  label: string;
  iso2: string;
  admin_label?: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  population: number;
};

export type ServiceAreaLabelsBundle = {
  schema_version: 1;
  countries: ServiceAreaCountryLabel[];
  regions: ServiceAreaRegionLabel[];
  cities: ServiceAreaCityLabel[];
};

export type ServiceAreaPolygonsBundle = {
  schema_version: 1;
  features: Record<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>;
};
