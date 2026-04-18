import { syntheticContinentSearchResults } from "./serviceAreaContinents.ts";
import type { ServiceAreaLabelsBundle, ServiceAreaSearchResult } from "./serviceAreaPickerTypes.ts";

export type ServiceAreaSearchIndex = {
  readonly rows: readonly IndexedRow[];
};

type IndexedRow = {
  readonly result: ServiceAreaSearchResult;
  /** -1 = worldwide/continent (top), 0 = country, 1 = region, 2 = city */
  readonly tier: -1 | 0 | 1 | 2;
  readonly population: number;
  /** folded lowercase string for matching */
  readonly haystack: string;
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function buildServiceAreaSearchIndex(bundle: ServiceAreaLabelsBundle): ServiceAreaSearchIndex {
  const rows: IndexedRow[] = [];
  for (const synth of syntheticContinentSearchResults()) {
    const alias = synth.kind === "worldwide" ? "world global everywhere earth" : "";
    rows.push({
      result: synth,
      tier: -1,
      population: 0,
      haystack: fold(`${synth.label} ${alias}`),
    });
  }
  for (const c of bundle.countries) {
    const result: ServiceAreaSearchResult = {
      provider_id: c.id,
      label: c.label,
      kind: "country",
      centroid: c.centroid,
      bbox: c.bbox,
      country_code: c.iso2,
    };
    rows.push({
      result,
      tier: 0,
      population: 0,
      haystack: fold(`${c.label} ${c.iso2}`),
    });
  }
  for (const r of bundle.regions) {
    const result: ServiceAreaSearchResult = {
      provider_id: r.id,
      label: r.label,
      kind: "region",
      centroid: r.centroid,
      bbox: r.bbox,
      country_code: r.iso2.length === 2 ? r.iso2 : undefined,
    };
    rows.push({
      result,
      tier: 1,
      population: 0,
      haystack: fold(`${r.label} ${r.iso2} ${r.admin_label ?? ""}`),
    });
  }
  for (const city of bundle.cities) {
    const result: ServiceAreaSearchResult = {
      provider_id: city.id,
      label: city.label,
      kind: "city",
      centroid: city.centroid,
      bbox: city.bbox,
      country_code: city.iso2,
      population: city.population,
    };
    rows.push({
      result,
      tier: 2,
      population: city.population,
      haystack: fold(`${city.label} ${city.iso2} ${city.admin_label ?? ""}`),
    });
  }
  return { rows };
}

export type SearchServiceAreaIndexOpts = {
  limit?: number;
  biasCountryCode?: string;
};

/**
 * Score a haystack against a query string. Returns 0 on no match, 2 for a
 * substring hit, 3 for a prefix/word-prefix hit.
 */
function scoreHaystack(haystack: string, q: string): number {
  if (haystack.startsWith(q) || haystack.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (haystack.includes(q)) return 2;
  return 0;
}

export function searchServiceAreaIndex(
  index: ServiceAreaSearchIndex,
  query: string,
  opts?: SearchServiceAreaIndexOpts,
): ServiceAreaSearchResult[] {
  const limit = opts?.limit ?? 8;
  const bias = opts?.biasCountryCode?.toUpperCase();
  const q = fold(query.trim());
  if (!q) return [];

  // Progressively drop trailing words so extra modifiers don't kill the search.
  // e.g. "san francisco bay area" → tries "san francisco bay area", then
  // "san francisco bay", then "san francisco" — the last still matches SF.
  const tokens = q.split(/\s+/).filter(Boolean);
  const queryCandidates: string[] = [];
  for (let n = tokens.length; n >= 1; n -= 1) {
    queryCandidates.push(tokens.slice(0, n).join(" "));
  }

  type Scored = { row: IndexedRow; score: number; bias: number };
  const scored: Scored[] = [];

  for (const row of index.rows) {
    const { haystack } = row;
    let score = 0;
    let usedCandidateIdx = -1;
    for (let i = 0; i < queryCandidates.length; i += 1) {
      const s = scoreHaystack(haystack, queryCandidates[i]!);
      if (s > 0) {
        score = s;
        usedCandidateIdx = i;
        break;
      }
    }
    if (score === 0) continue;
    // Penalize matches that only survived by dropping trailing tokens,
    // so exact-phrase hits rank above partial-phrase hits.
    if (usedCandidateIdx > 0) score = Math.max(1, score - usedCandidateIdx);

    const iso = row.result.country_code?.toUpperCase();
    const biasHit = bias && iso === bias ? 1 : 0;
    scored.push({ row, score, bias: biasHit });
  }

  scored.sort((a, b) => {
    if (b.bias !== a.bias) return b.bias - a.bias;
    if (b.score !== a.score) return b.score - a.score;
    if (a.row.tier !== b.row.tier) return a.row.tier - b.row.tier;
    if (b.row.population !== a.row.population) return b.row.population - a.row.population;
    return a.row.result.label.localeCompare(b.row.result.label);
  });

  const out: ServiceAreaSearchResult[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const id = s.row.result.provider_id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s.row.result);
    if (out.length >= limit) break;
  }
  return out;
}
