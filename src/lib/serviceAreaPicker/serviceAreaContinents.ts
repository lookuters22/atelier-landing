/**
 * Continent + "worldwide" synthetic selections.
 *
 * These are surfaced in the search index and the seed suggestions so users can
 * quickly pick a large region (e.g. "Europe") or declare they serve everywhere
 * ("Worldwide"). At render time the map looks up each continent's ISO2 member
 * list and highlights the matching country polygons from `polygons.json`.
 *
 * Bounding boxes are hand-tuned to frame the _main_ landmass of each continent.
 * We intentionally do NOT derive them from Natural Earth at build time because
 * several countries (France, Netherlands, UK, USA, Russia, …) own overseas
 * territories whose raw bboxes would make a continent bbox unusably wide.
 */
import type { ServiceAreaSearchResult } from "./serviceAreaPickerTypes.ts";

export type ContinentDef = {
  readonly id: string; // "ne:continent:europe"
  readonly label: string;
  readonly centroid: [number, number];
  readonly bbox: [number, number, number, number];
  readonly iso2_members: readonly string[];
};

export const WORLDWIDE_PROVIDER_ID = "synth:worldwide";

export const WORLDWIDE_DEF = {
  id: WORLDWIDE_PROVIDER_ID,
  label: "Worldwide",
  centroid: [0, 20] as [number, number],
  bbox: [-180, -60, 180, 85] as [number, number, number, number],
} as const;

export const CONTINENT_DEFS: readonly ContinentDef[] = [
  {
    id: "ne:continent:europe",
    label: "Europe",
    centroid: [15, 54],
    bbox: [-25, 34, 50, 72],
    iso2_members: [
      "AL","AD","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES",
      "FI","FO","FR","GB","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV",
      "MC","MD","ME","MK","MT","NL","NO","PL","PT","RO","RS","RU","SE","SI",
      "SK","SM","UA","VA","XK",
    ],
  },
  {
    id: "ne:continent:asia",
    label: "Asia",
    centroid: [90, 35],
    bbox: [25, -12, 180, 78],
    iso2_members: [
      "AE","AF","AM","AZ","BD","BH","BN","BT","CN","GE","HK","ID","IL","IN",
      "IQ","IR","JO","JP","KG","KH","KP","KR","KW","KZ","LA","LB","LK","MM",
      "MN","MO","MV","MY","NP","OM","PH","PK","PS","QA","SA","SG","SY","TH",
      "TJ","TL","TM","TR","TW","UZ","VN","YE",
    ],
  },
  {
    id: "ne:continent:africa",
    label: "Africa",
    centroid: [20, 2],
    bbox: [-20, -36, 52, 38],
    iso2_members: [
      "AO","BF","BI","BJ","BW","CD","CF","CG","CI","CM","CV","DJ","DZ","EG",
      "EH","ER","ET","GA","GH","GM","GN","GQ","GW","KE","KM","LR","LS","LY",
      "MA","MG","ML","MR","MU","MW","MZ","NA","NE","NG","RW","SC","SD","SL",
      "SN","SO","SS","ST","SZ","TD","TG","TN","TZ","UG","ZA","ZM","ZW",
    ],
  },
  {
    id: "ne:continent:north_america",
    label: "North America",
    centroid: [-100, 45],
    bbox: [-170, 7, -52, 83],
    iso2_members: [
      "AG","BB","BS","BZ","CA","CR","CU","DM","DO","GD","GL","GT","HN","HT",
      "JM","KN","LC","MX","NI","PA","PR","SV","TC","TT","US","VC",
    ],
  },
  {
    id: "ne:continent:south_america",
    label: "South America",
    centroid: [-60, -15],
    bbox: [-82, -56, -34, 13],
    iso2_members: [
      "AR","BO","BR","CL","CO","EC","FK","GF","GY","PE","PY","SR","UY","VE",
    ],
  },
  {
    id: "ne:continent:oceania",
    label: "Oceania",
    centroid: [145, -22],
    bbox: [110, -48, 180, -5],
    iso2_members: [
      "AU","FJ","FM","KI","MH","NC","NR","NZ","PF","PG","PW","SB","TO","TV",
      "VU","WS",
    ],
  },
  {
    id: "ne:continent:antarctica",
    label: "Antarctica",
    centroid: [0, -80],
    bbox: [-180, -90, 180, -60],
    iso2_members: ["AQ"],
  },
];

const BY_ID = new Map<string, ContinentDef>(CONTINENT_DEFS.map((c) => [c.id, c]));

export function getContinentById(id: string): ContinentDef | undefined {
  return BY_ID.get(id);
}

/** Synthetic search result rows to surface continents + worldwide in the search index. */
export function syntheticContinentSearchResults(): ServiceAreaSearchResult[] {
  const out: ServiceAreaSearchResult[] = [];
  out.push({
    provider_id: WORLDWIDE_DEF.id,
    label: WORLDWIDE_DEF.label,
    kind: "worldwide",
    centroid: WORLDWIDE_DEF.centroid,
    bbox: WORLDWIDE_DEF.bbox,
  });
  for (const c of CONTINENT_DEFS) {
    out.push({
      provider_id: c.id,
      label: c.label,
      kind: "continent",
      centroid: c.centroid,
      bbox: c.bbox,
    });
  }
  return out;
}
