/**
 * One-time build: Natural Earth (PD) + GeoNames cities15000 (CC-BY 4.0) → public/serviceAreaPicker/*.json
 * Run: npx tsx scripts/buildServiceAreaDataset.ts
 */
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bbox from "@turf/bbox";
import centroid from "@turf/centroid";
import simplify from "@turf/simplify";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import unzipper from "unzipper";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "serviceAreaPicker");

const NE_COUNTRIES =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const NE_ADMIN1 =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";
const GEONAMES_CITIES = "https://download.geonames.org/export/dump/cities15000.zip";

type PolyRecord = Record<string, Feature<Polygon | MultiPolygon>>;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

function simplifyFeature(f: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> {
  // Tolerance ~0.005° (~500 m at the equator) keeps small islands (Hawaii, PR, USVI,
  // Guam, the Aegean, etc.) intact while still trimming Natural Earth coastlines enough
  // to keep the bundled `polygons.json` under ~1 MB.
  return simplify(f, { tolerance: 0.005, highQuality: false, mutate: false });
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function parseCitiesFromZip(zipPath: string): Promise<
  Array<{
    id: string;
    label: string;
    iso2: string;
    admin_label?: string;
    centroid: [number, number];
    bbox: [number, number, number, number];
    population: number;
  }>
> {
  const directory = await unzipper.Open.file(zipPath);
  const citiesFile = directory.files.find((f) => f.path.endsWith("cities15000.txt"));
  if (!citiesFile) throw new Error("cities15000.txt not found in zip");
  const buf = await citiesFile.buffer();
  const text = buf.toString("utf8");
  const out: Array<{
    id: string;
    label: string;
    iso2: string;
    admin_label?: string;
    centroid: [number, number];
    bbox: [number, number, number, number];
    population: number;
  }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const p = line.split("\t");
    if (p.length < 15) continue;
    const geonameid = p[0]!;
    const name = p[1]!;
    const lat = Number(p[4]);
    const lng = Number(p[5]);
    const fclass = p[6]!;
    const country = (p[8] ?? "").toUpperCase();
    const admin1 = p[10] ?? "";
    const pop = Number(p[14] ?? "0");
    if (fclass !== "P" || !country || country.length !== 2 || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const pad = 0.06;
    out.push({
      id: `gn:city:${geonameid}`,
      label: name,
      iso2: country,
      admin_label: admin1 || undefined,
      centroid: [lng, lat],
      bbox: [lng - pad, lat - pad, lng + pad, lat + pad],
      population: pop,
    });
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const countriesRaw = await fetchJson<FeatureCollection>(NE_COUNTRIES);
  const admin1Raw = await fetchJson<FeatureCollection>(NE_ADMIN1);

  /**
   * Natural Earth sets ISO_A2 = "-99" for a handful of countries where the code is
   * politically contested or the entity is split (France, Norway, Kosovo, Somaliland,
   * N. Cyprus, etc.). The parallel `ISO_A2_EH` ("exception handled") field fixes
   * these. We prefer EH and only fall back to ISO_A2.
   */
  const pickIso2 = (props: Record<string, string | undefined>): string => {
    const eh = String(props.ISO_A2_EH ?? "").toUpperCase();
    if (eh && eh !== "-99") return eh;
    const raw = String(props.ISO_A2 ?? "").toUpperCase();
    if (raw && raw !== "-99") return raw;
    return "";
  };

  const adm0ToIso2 = new Map<string, string>();
  for (const f of countriesRaw.features) {
    const props = (f.properties ?? {}) as Record<string, string | undefined>;
    const iso2 = pickIso2(props);
    const a3 = String(props.ADM0_A3 ?? "");
    if (iso2 && a3) adm0ToIso2.set(a3, iso2);
  }

  const countries: Array<{
    id: string;
    label: string;
    iso2: string;
    centroid: [number, number];
    bbox: [number, number, number, number];
  }> = [];
  const regions: Array<{
    id: string;
    label: string;
    iso2: string;
    admin_label?: string;
    centroid: [number, number];
    bbox: [number, number, number, number];
  }> = [];
  const polygons: PolyRecord = {};

  for (const f of countriesRaw.features) {
    const props = (f.properties ?? {}) as Record<string, string | undefined>;
    const iso2 = pickIso2(props);
    if (!iso2) continue;
    const name = String(props.NAME ?? props.ADMIN ?? "");
    if (!name || !f.geometry) continue;
    const simp = simplifyFeature(f as Feature<Polygon | MultiPolygon>);
    const id = `ne:country:${iso2}`;
    polygons[id] = simp;
    const c = centroid(simp);
    const b = bbox(simp) as [number, number, number, number];
    countries.push({
      id,
      label: name,
      iso2,
      centroid: c.geometry.coordinates as [number, number],
      bbox: b,
    });
  }

  for (const f of admin1Raw.features) {
    const props = (f.properties ?? {}) as Record<string, string | undefined>;
    const adm0 = String(props.adm0_a3 ?? "");
    const adm1 = String(props.adm1_code ?? "");
    const iso3166 = String(props.iso_3166_2 ?? "")
      .replace(/\s/g, "")
      .toUpperCase();
    const name = String(props.name ?? "");
    if (!name || !f.geometry || !adm0) continue;
    let iso2 = String(props.iso_a2 ?? "")
      .trim()
      .toUpperCase();
    if (iso2.length !== 2) iso2 = adm0ToIso2.get(adm0) ?? "XX";
    const id =
      iso3166.length >= 4
        ? `ne:region:${iso3166}`
        : `ne:region:${adm0}-${adm1 || "0"}`;
    if (polygons[id]) continue;
    const simp = simplifyFeature(f as Feature<Polygon | MultiPolygon>);
    polygons[id] = simp;
    const c = centroid(simp);
    const b = bbox(simp) as [number, number, number, number];
    regions.push({
      id,
      label: name,
      iso2,
      admin_label: adm1 || undefined,
      centroid: c.geometry.coordinates as [number, number],
      bbox: b,
    });
  }

  const zipPath = join(OUT_DIR, "_cities15000.zip");
  await downloadToFile(GEONAMES_CITIES, zipPath);
  const cities = await parseCitiesFromZip(zipPath);
  try {
    unlinkSync(zipPath);
  } catch {
    /* ignore */
  }

  const labels = {
    schema_version: 1 as const,
    countries,
    regions,
    cities,
  };

  writeFileSync(join(OUT_DIR, "labels.json"), JSON.stringify(labels));
  writeFileSync(join(OUT_DIR, "polygons.json"), JSON.stringify({ schema_version: 1, features: polygons }));

  writeFileSync(
    join(OUT_DIR, "LICENSES.md"),
    `# Service area picker data\n\n- **Natural Earth** admin-0 / admin-1 vector data: public domain ([Natural Earth](https://www.naturalearthdata.com/)).\n- **GeoNames** \`cities15000.txt\`: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) — attribution: "City data © GeoNames, CC-BY 4.0".\n`,
  );

  console.log("Wrote labels.json, polygons.json, LICENSES.md to public/serviceAreaPicker/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
