import type { ServiceAreaLabelsBundle, ServiceAreaPolygonsBundle } from "./serviceAreaPickerTypes.ts";

export class ServiceAreaDatasetLoadError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "ServiceAreaDatasetLoadError";
  }
}

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${base.endsWith("/") ? base : `${base}/`}${p}`;
}

let labelsInflight: Promise<ServiceAreaLabelsBundle> | null = null;
let polygonsInflight: Promise<ServiceAreaPolygonsBundle> | null = null;

function assertLabels(v: unknown): asserts v is ServiceAreaLabelsBundle {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("invalid labels");
  const o = v as Record<string, unknown>;
  if (o.schema_version !== 1) throw new Error("labels schema_version");
  if (!Array.isArray(o.countries) || !Array.isArray(o.regions) || !Array.isArray(o.cities)) {
    throw new Error("labels shape");
  }
}

function assertPolygons(v: unknown): asserts v is ServiceAreaPolygonsBundle {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("invalid polygons");
  const o = v as Record<string, unknown>;
  if (o.schema_version !== 1) throw new Error("polygons schema_version");
  if (!o.features || typeof o.features !== "object" || Array.isArray(o.features)) {
    throw new Error("polygons.features");
  }
}

export async function loadServiceAreaLabels(): Promise<ServiceAreaLabelsBundle> {
  if (!labelsInflight) {
    const url = assetUrl("serviceAreaPicker/labels.json");
    labelsInflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new ServiceAreaDatasetLoadError(`HTTP ${r.status}`, url);
        return r.json();
      })
      .then((data) => {
        assertLabels(data);
        return data;
      })
      .catch((e) => {
        labelsInflight = null;
        throw e instanceof ServiceAreaDatasetLoadError
          ? e
          : new ServiceAreaDatasetLoadError(String((e as Error)?.message ?? e), url);
      });
  }
  return labelsInflight;
}

export async function loadServiceAreaPolygons(): Promise<ServiceAreaPolygonsBundle> {
  if (!polygonsInflight) {
    const url = assetUrl("serviceAreaPicker/polygons.json");
    polygonsInflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new ServiceAreaDatasetLoadError(`HTTP ${r.status}`, url);
        return r.json();
      })
      .then((data) => {
        assertPolygons(data);
        return data;
      })
      .catch((e) => {
        polygonsInflight = null;
        throw e instanceof ServiceAreaDatasetLoadError
          ? e
          : new ServiceAreaDatasetLoadError(String((e as Error)?.message ?? e), url);
      });
  }
  return polygonsInflight;
}
