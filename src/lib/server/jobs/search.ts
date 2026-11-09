import "server-only";
import { dedupeKey } from "../../jobs/extract";
import { evaluate } from "../../jobs/filter";
import { keywordCompatibility, profileTerms } from "../../jobs/match";
import { regionById } from "../../jobs/regions";
import type { Compatibility, Job, JobFilters, LocationQuery, ProviderStatus, ResultJob, SearchResponse } from "../../jobs/types";
import { hashString } from "../../facts";
import { store } from "../context";
import { storeJobs } from "../db";
import { cityInCountry, countryName, fold } from "../geo";
import { PROVIDERS, runProvider } from "./providers";
import type { Profile } from "./profiles";

const SECTION_LIMIT = 150;
const LIST_DESCRIPTION_CHARS = 700;

export class SearchInputError extends Error {}

export function locationLabel(loc: LocationQuery): string {
  if (loc.type === "city") return `${loc.city}, ${countryName(loc.countryCode)}`;
  if (loc.type === "country") return countryName(loc.countryCode);
  return regionById(loc.regionId)?.name ?? loc.regionId;
}

/** Keep one listing per job; record the other sources it appeared on. Prefers the fullest description. */
export function dedupe(jobs: Job[]): { jobs: Job[]; removed: number } {
  const byKey = new Map<string, Job>();
  const byUrl = new Map<string, string>();
  let removed = 0;
  for (const j of jobs) {
    const key = byUrl.get(j.url) ?? dedupeKey(j.title, j.company, j.location.city ?? j.location.remoteScope);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...j, alsoListedOn: [...j.alsoListedOn] });
      byUrl.set(j.url, key);
      continue;
    }
    if (existing.id === j.id) continue; // same listing returned by two queries
    removed++;
    const [keep, other] = j.descriptionComplete && !existing.descriptionComplete ? [j, existing] : [existing, j];
    keep.alsoListedOn = [...existing.alsoListedOn, ...j.alsoListedOn];
    if (!keep.alsoListedOn.some((a) => a.url === other.url) && other.url !== keep.url)
      keep.alsoListedOn.push({ provider: other.provider, providerName: other.sourceLabel, url: other.url });
    // Fill gaps from the other listing (never overwrite published data).
    keep.salary ??= other.salary;
    keep.postedAt ??= other.postedAt;
    keep.company ??= other.company;
    byKey.set(key, { ...keep });
    byUrl.set(j.url, key);
  }
  return { jobs: [...byKey.values()], removed };
}

function cityMatches(job: Job, city: string, countryCode: string): boolean {
  if (job.location.countryCode !== countryCode) return false;
  const target = fold(cityInCountry(city, countryCode) ?? city);
  if (job.location.city && fold(job.location.city) === target) return true;
  return Boolean(job.location.raw && fold(job.location.raw).split(" ").join(" ").includes(target));
}

export function aiCacheKey(jobId: string, profile: Profile): string {
  return `assess:${hashString(profile.text)}:${jobId}`;
}

function rank(list: ResultJob[], hasProfile: boolean): ResultJob[] {
  const time = (j: Job) => (j.postedAt ? new Date(j.postedAt).getTime() : 0);
  return list.sort((a, b) => (hasProfile ? (b.compatibility?.score ?? 0) - (a.compatibility?.score ?? 0) : 0) || time(b) - time(a));
}

const trim = (j: ResultJob): ResultJob => ({ ...j, description: j.description.length > LIST_DESCRIPTION_CHARS ? `${j.description.slice(0, LIST_DESCRIPTION_CHARS)}…` : j.description });

export async function searchJobs(location: LocationQuery, filters: JobFilters, profile: Profile | null): Promise<SearchResponse> {
  let countries: string[];
  let city: string | null = null;
  if (location.type === "city") {
    countries = [location.countryCode];
    city = location.city;
  } else if (location.type === "country") countries = [location.countryCode];
  else {
    const region = regionById(location.regionId);
    if (!region) throw new SearchInputError("Unknown region.");
    countries = region.countries;
  }

  // For a city search, ask query-based sources for the city and for the whole country,
  // so the "elsewhere in the country" section has candidates too.
  const contexts = city ? [{ countries, city, filters }, { countries, city: null, filters }] : [{ countries, city: null, filters }];
  // Feeds (countries() === null) return everything at once, so they only run for the first context.
  const settled = await Promise.all(PROVIDERS.flatMap((p) => contexts.filter((_, i) => i === 0 || p.countries() !== null).map((ctx) => runProvider(p, ctx))));

  const statusByProvider = new Map<string, ProviderStatus>();
  const raw: Job[] = [];
  for (const r of settled) {
    if (!r) continue;
    raw.push(...r.jobs);
    const prev = statusByProvider.get(r.status.provider);
    if (!prev || prev.state !== "ok") statusByProvider.set(r.status.provider, r.status);
  }
  const { jobs, removed } = dedupe(raw);

  const terms = profile ? profileTerms(profile.text) : [];
  const results: ResultJob[] = [];
  for (const job of jobs) {
    const { excluded, unverified } = evaluate(job, filters);
    if (excluded) continue;
    let compatibility: Compatibility | null = null;
    if (profile) {
      // AI assessments are personal (they quote the user's resume): per-user cache only.
      compatibility = (await store().aiCacheGet<Compatibility>(aiCacheKey(job.id, profile), 30 * 86400000)) ?? keywordCompatibility(job, profile.text, terms);
    }
    const isRemoteOnly = !job.location.countryCode;
    let scope: ResultJob["scope"];
    if (isRemoteOnly) scope = "remote";
    else if (location.type === "city") scope = cityMatches(job, location.city, location.countryCode) ? "local" : "nationwide";
    else if (location.type === "country") scope = "nationwide";
    else scope = "regional";
    results.push({ ...job, unverifiedFilters: unverified, compatibility, scope });
  }
  await storeJobs(results);

  const by = (s: ResultJob["scope"]) => rank(results.filter((r) => r.scope === s), Boolean(profile));
  const sections: SearchResponse["sections"] = {};
  if (location.type === "city") {
    const nation = by("nationwide");
    sections.local = by("local").slice(0, SECTION_LIMIT).map(trim);
    sections.nationwide = nation.slice(0, 5).map(trim);
    sections.nationwideTotal = nation.length;
  } else if (location.type === "country") {
    sections.nationwide = by("nationwide").slice(0, SECTION_LIMIT).map(trim);
  } else {
    sections.regional = by("regional").slice(0, SECTION_LIMIT).map(trim);
  }
  sections.remote = by("remote").slice(0, SECTION_LIMIT).map(trim);

  return {
    location: { ...location, label: locationLabel(location) },
    countries,
    sections,
    totals: { found: raw.length, afterFilters: results.length, duplicatesRemoved: removed },
    providers: PROVIDERS.map((p) => statusByProvider.get(p.id)!).filter(Boolean),
    profile: profile ? { label: profile.label } : null,
  };
}
