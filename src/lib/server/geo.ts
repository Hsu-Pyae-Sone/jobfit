import "server-only";
import { createRequire } from "node:module";
import countries from "i18n-iso-countries";
import { REGIONS } from "../jobs/regions";

// Place data: city names from GeoNames (via all-the-cities, CC BY 4.0) and country names
// in several languages (i18n-iso-countries). Used for the location picker and to map the
// free-text location of a job posting to a country.

const require = createRequire(import.meta.url);
const LANGS = ["en", "de", "fr", "nl", "fi", "sv", "es", "it", "pl", "pt", "da", "no"] as const;
for (const l of LANGS) countries.registerLocale(require(`i18n-iso-countries/langs/${l}.json`));

interface City {
  name: string;
  country: string;
  population: number;
}

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * English/native name variants missing from the dataset (which stores one name per city).
 * Without these, e.g. "Cologne" resolves to a small town in Italy instead of Köln.
 */
const CITY_ALIASES: Record<string, [string, string]> = {
  cologne: ["Köln", "DE"],
  koeln: ["Köln", "DE"],
  munchen: ["Munich", "DE"],
  muenchen: ["Munich", "DE"],
  nuremberg: ["Nürnberg", "DE"],
  nuernberg: ["Nürnberg", "DE"],
  hanover: ["Hannover", "DE"],
  frankfurt: ["Frankfurt am Main", "DE"],
  gothenburg: ["Göteborg", "SE"],
  geneva: ["Genève", "CH"],
  genf: ["Genève", "CH"],
  antwerp: ["Antwerpen", "BE"],
  "den haag": ["The Hague", "NL"],
  "s gravenhage": ["The Hague", "NL"],
  wien: ["Vienna", "AT"],
  kiev: ["Kyiv", "UA"],
  praha: ["Prague", "CZ"],
  warszawa: ["Warsaw", "PL"],
  milano: ["Milan", "IT"],
  roma: ["Rome", "IT"],
  firenze: ["Florence", "IT"],
  torino: ["Turin", "IT"],
  napoli: ["Naples", "IT"],
  lisboa: ["Lisbon", "PT"],
  bruxelles: ["Brussels", "BE"],
  brussel: ["Brussels", "BE"],
  kobenhavn: ["Copenhagen", "DK"],
  aarhus: ["Århus", "DK"],
  seville: ["Sevilla", "ES"],
};

let cityIndex: Map<string, City[]> | null = null;
function cities(): Map<string, City[]> {
  if (cityIndex) return cityIndex;
  const all = require("all-the-cities") as { name: string; altName: string; country: string; population: number }[];
  cityIndex = new Map();
  for (const c of all) {
    if (c.population < 1000) continue;
    for (const n of new Set([fold(c.name), c.altName ? fold(c.altName) : ""])) {
      if (!n) continue;
      const list = cityIndex.get(n) ?? [];
      list.push({ name: c.name, country: c.country, population: c.population });
      cityIndex.set(n, list);
    }
  }
  for (const list of cityIndex.values()) list.sort((a, b) => b.population - a.population);
  for (const [alias, [name, country]] of Object.entries(CITY_ALIASES)) {
    const target = cityIndex.get(fold(name))?.filter((c) => c.country === country) ?? [];
    if (target.length) cityIndex.set(alias, [...target, ...(cityIndex.get(alias) ?? []).filter((c) => !target.includes(c))]);
  }
  return cityIndex;
}

export function countryName(code: string): string {
  return countries.getName(code, "en") ?? code;
}

const EXTRA_COUNTRY_WORDS: Record<string, string> = {
  uk: "GB",
  "u k": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "great britain": "GB",
  britain: "GB",
  usa: "US",
  "u s": "US",
  "u s a": "US",
  "united states": "US",
  america: "US",
  deutschland: "DE",
  holland: "NL",
  "the netherlands": "NL",
  suomi: "FI",
  schweiz: "CH",
  suisse: "CH",
  svizzera: "CH",
  osterreich: "AT",
  uae: "AE",
};

/** ISO code for a country name in any registered language, or null. */
export function countryCodeFromName(name: string): string | null {
  const f = fold(name);
  if (!f) return null;
  if (EXTRA_COUNTRY_WORDS[f]) return EXTRA_COUNTRY_WORDS[f];
  // Two-letter tokens are usually states/provinces ("CA", "NY") or words, not countries.
  if (f.length <= 2) return null;
  for (const l of LANGS) {
    const code = countries.getAlpha2Code(name.trim(), l);
    if (code) return code;
  }
  return null;
}

export function lookupCity(name: string, preferCountries?: string[]): City | null {
  const list = cities().get(fold(name));
  if (!list?.length) return null;
  if (preferCountries?.length) {
    const preferred = list.find((c) => preferCountries.includes(c.country));
    if (preferred) return preferred;
  }
  return list[0];
}

/** Is `city` a known city in `countryCode`? Returns the canonical name. */
export function cityInCountry(city: string, countryCode: string): string | null {
  const list = cities().get(fold(city));
  return list?.find((c) => c.country === countryCode)?.name ?? null;
}

/**
 * Map a posting's free-text location ("Utrecht, Utrecht, Nederland", "Berlin", "Remote")
 * to a city and country. A country named in the text wins; otherwise the most populous
 * city with that name is used, preferring `preferCountries` (the source's market).
 */
export function resolveLocation(raw: string | null, preferCountries?: string[]): { city: string | null; countryCode: string | null } {
  if (!raw?.trim()) return { city: null, countryCode: null };
  const parts = raw
    .split(/[,/|;()]|\s[-–]\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  let countryCode: string | null = null;
  for (const p of [...parts].reverse()) {
    countryCode = countryCodeFromName(p);
    if (countryCode) break;
  }
  for (const p of parts) {
    const cleaned = p.replace(/\d+/g, "").replace(/\b(str|strasse|straße|street|road)\b.*$/i, "").trim();
    if (!cleaned || countryCodeFromName(cleaned)) continue;
    const c = lookupCity(cleaned, countryCode ? [countryCode] : preferCountries);
    if (c && (!countryCode || c.country === countryCode)) return { city: c.name, countryCode: c.country };
    // try the first word ("Stuttgart Schockenriedstr")
    const first = cleaned.split(/\s+/)[0];
    const c2 = first !== cleaned ? lookupCity(first, countryCode ? [countryCode] : preferCountries) : null;
    if (c2 && (!countryCode || c2.country === countryCode) && c2.population > 20000) return { city: c2.name, countryCode: c2.country };
  }
  return { city: null, countryCode };
}

export interface LocationSuggestion {
  type: "city" | "country" | "region";
  label: string;
  detail: string;
  city?: string;
  countryCode?: string;
  regionId?: string;
}

const ALL_CODES = Object.keys(countries.getAlpha2Codes());

export function suggestLocations(q: string, limit = 8): LocationSuggestion[] {
  const f = fold(q);
  if (f.length < 2) return [];
  const out: LocationSuggestion[] = [];
  for (const r of REGIONS) {
    if (fold(r.name).includes(f)) out.push({ type: "region", label: r.name, detail: r.kind === "continent" ? "Continent" : "Region", regionId: r.id });
  }
  for (const code of ALL_CODES) {
    const names = LANGS.map((l) => countries.getName(code, l)).filter(Boolean) as string[];
    if (names.some((n) => fold(n).startsWith(f))) out.push({ type: "country", label: countryName(code), detail: "Country", countryCode: code });
  }
  // Cities: prefix matches, most populous first
  const cityHits: City[] = [];
  for (const [name, list] of cities()) {
    if (name.startsWith(f)) cityHits.push(...list.filter((c) => c.population >= 15000 || name === f));
  }
  cityHits.sort((a, b) => b.population - a.population);
  const seen = new Set<string>();
  for (const c of cityHits) {
    const key = `${c.name}|${c.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: "city", label: c.name, detail: countryName(c.country), city: c.name, countryCode: c.country });
    if (seen.size >= limit) break;
  }
  // Exact matches first, then regions/countries, then cities.
  const rank = (s: LocationSuggestion) => (fold(s.label) === f ? 0 : s.type === "city" ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}
