import "server-only";
import { htmlToText } from "../../html";
import {
  arrangementFromText,
  employmentFromLabels,
  experienceFromLabels,
  experienceFromTitle,
  extractQualifications,
  parseSalary,
  postingLanguage,
  requiredLanguages,
  sourced,
} from "../../jobs/extract";
import { SCOPE_WORDS } from "../../jobs/regions";
import type { EmploymentType, Job, JobFilters, ProviderId, ProviderStatus, Salary } from "../../jobs/types";
import { cacheGet, cacheGetStale, cacheSet, counterGet, counterSet } from "../db";
import { countryCodeFromName, countryName, fold, resolveLocation } from "../geo";

// Job sources. Only official/public APIs and feeds are used, each within its published
// terms. No scraping. Every listing comes from a source response - nothing is generated.

export interface SearchContext {
  countries: string[];
  city: string | null;
  filters: JobFilters;
}

export interface ProviderResult {
  jobs: Job[];
  status: ProviderStatus;
}

export interface Provider {
  id: ProviderId;
  name: string;
  homepage: string;
  needsKey: string | null; // env var(s) that enable it
  configured(): boolean;
  /** Countries this source can return on-site jobs for (null = decided per response). */
  countries(): string[] | null;
  search(ctx: SearchContext): Promise<ProviderResult>;
}

class SourceError extends Error {
  constructor(
    message: string,
    public rateLimited = false,
  ) {
    super(message);
  }
}

async function getJson(url: string, init?: RequestInit, timeoutMs = 20000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new SourceError("Could not reach the service.");
  }
  if (res.status === 429) throw new SourceError("Rate limit reached; try again later.", true);
  if (res.status === 401 || res.status === 403) throw new SourceError("The API key was rejected.");
  if (!res.ok) throw new SourceError(`The service returned an error (${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new SourceError("The service returned an unreadable response.");
  }
}

/** Fields derived from the description text, filled in for every source the same way. */
function finish(job: Omit<Job, "qualifications" | "languagesRequired" | "postingLanguage">): Job {
  const text = `${job.title}\n${job.description}`;
  return {
    ...job,
    workArrangement: job.workArrangement ?? sourced(arrangementFromText(text), "description"),
    experienceLevel: job.experienceLevel ?? sourced(experienceFromTitle(job.title), "title"),
    qualifications: extractQualifications(job.description),
    languagesRequired: requiredLanguages(job.description),
    postingLanguage: postingLanguage(job.description),
  };
}

const emptyLoc = { raw: null, city: null, countryCode: null, remoteScope: null, remoteScopeCountries: null };

// ---------------------------------------------------------------------------
// Arbeitnow — free public job board API (no key). Europe-focused, updated hourly.
// https://www.arbeitnow.com/blog/job-board-api
// ---------------------------------------------------------------------------

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

const ARBEITNOW_PAGES = 3;
const ARBEITNOW_MARKETS = ["DE", "GB", "NL", "FR", "CH", "AT", "ES", "IE", "BE", "DK", "SE", "PL", "IT"];

async function arbeitnowFeed(): Promise<{ jobs: Job[]; cached: boolean; stale: boolean; error?: string }> {
  const KEY = "feed:arbeitnow";
  const fresh = await cacheGet<Job[]>(KEY, 60 * 60 * 1000);
  if (fresh) return { jobs: fresh.value, cached: true, stale: false };
  try {
    const all: ArbeitnowJob[] = [];
    for (let page = 1; page <= ARBEITNOW_PAGES; page++) {
      const d = (await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`)) as { data: ArbeitnowJob[]; links?: { next: string | null } };
      all.push(...d.data);
      if (!d.links?.next) break;
    }
    // The feed has no visa field; the documented visa_sponsorship=true filter tells us which jobs offer it.
    const visa = new Set<string>();
    const v = (await getJson("https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true")) as { data: ArbeitnowJob[] };
    v.data.forEach((j) => visa.add(j.slug));

    const jobs = all.map((j): Job => {
      const loc = resolveLocation(j.location, ARBEITNOW_MARKETS);
      const desc = htmlToText(j.description ?? "");
      const types = employmentFromLabels(j.job_types ?? []);
      return finish({
        id: `arbeitnow:${j.slug}`,
        provider: "arbeitnow",
        providerName: "Arbeitnow",
        sourceLabel: "Arbeitnow",
        url: j.url,
        title: j.title,
        company: j.company_name || null,
        location: { ...emptyLoc, raw: j.location || null, city: loc.city, countryCode: loc.countryCode, remoteScopeCountries: j.remote && loc.countryCode ? [loc.countryCode] : null, remoteScope: j.remote && loc.countryCode ? countryName(loc.countryCode) : null },
        workArrangement: j.remote ? { value: "remote", from: "source" } : arrangementFromText(`${j.title}\n${desc}`) ? null : { value: "not_remote", from: "source" },
        employmentTypes: sourced(types, "source"),
        experienceLevel: sourced(experienceFromLabels(j.job_types ?? []), "source"),
        salary: null,
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        industry: null,
        tags: j.tags ?? [],
        description: desc,
        visaSponsorship: visa.has(j.slug) ? true : null,
        descriptionComplete: true,
        alsoListedOn: [],
      });
    });
    await cacheSet(KEY, jobs);
    return { jobs, cached: false, stale: false };
  } catch (e) {
    const stale = await cacheGetStale<Job[]>(KEY);
    if (stale) return { jobs: stale.value, cached: true, stale: true, error: (e as Error).message };
    throw e;
  }
}

const arbeitnow: Provider = {
  id: "arbeitnow",
  name: "Arbeitnow",
  homepage: "https://www.arbeitnow.com",
  needsKey: null,
  configured: () => true,
  countries: () => null,
  async search(ctx) {
    const feed = await arbeitnowFeed();
    const jobs = feed.jobs.filter((j) => j.location.countryCode && ctx.countries.includes(j.location.countryCode));
    const covered = [...new Set(feed.jobs.map((j) => j.location.countryCode).filter(Boolean))] as string[];
    return {
      jobs,
      status: {
        provider: "arbeitnow",
        name: "Arbeitnow",
        state: jobs.length ? (feed.stale ? "cached" : "ok") : "not_covered",
        message: jobs.length
          ? `${jobs.length} listings${feed.stale ? " (service unavailable — showing the last saved results)" : ""}.`
          : `No current listings in ${ctx.countries.length === 1 ? countryName(ctx.countries[0]) : "these countries"}.`,
        countries: covered,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Remotive — public remote-jobs API (no key). Terms: link back to Remotive and name it as
// the source, fetch at most ~4 times a day, show jobs with a 24-hour delay.
// https://github.com/remotive-com/remote-jobs-api
// ---------------------------------------------------------------------------

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

/** "Europe, USA, Canada" / "Worldwide" / "UK" → ISO codes; null if nothing recognisable. */
export function parseRemoteScope(text: string): string[] | null {
  const out = new Set<string>();
  for (const part of text.split(/,|\/|;|\bor\b|\band\b/i).map((p) => p.trim()).filter(Boolean)) {
    const key = fold(part).replace(/\b(only|timezones?|based|residents?)\b/g, "").trim();
    if (SCOPE_WORDS[key]) SCOPE_WORDS[key].forEach((c) => out.add(c));
    else {
      const code = countryCodeFromName(part);
      if (code) out.add(code);
    }
  }
  return out.size ? (out.has("*") ? ["*"] : [...out]) : null;
}

const REMOTIVE_TYPES: Record<string, EmploymentType[]> = {
  full_time: ["full_time"],
  part_time: ["part_time"],
  contract: ["contract"],
  freelance: ["contract"],
  internship: ["internship"],
};

async function remotiveFeed(): Promise<{ jobs: Job[]; stale: boolean }> {
  const KEY = "feed:remotive";
  const fresh = await cacheGet<Job[]>(KEY, 6 * 60 * 60 * 1000); // ≤ 4 fetches a day
  if (fresh) return { jobs: fresh.value, stale: false };
  try {
    const d = (await getJson("https://remotive.com/api/remote-jobs", undefined, 40000)) as { jobs: RemotiveJob[] };
    const jobs = d.jobs.map((j): Job => {
      const scope = j.candidate_required_location?.trim() || null;
      const types = REMOTIVE_TYPES[j.job_type] ?? [];
      return finish({
        id: `remotive:${j.id}`,
        provider: "remotive",
        providerName: "Remotive",
        sourceLabel: "Remotive",
        url: j.url,
        title: j.title,
        company: j.company_name?.trim() || null,
        location: { ...emptyLoc, remoteScope: scope, remoteScopeCountries: scope ? parseRemoteScope(scope) : null },
        workArrangement: { value: "remote", from: "source" },
        employmentTypes: sourced(types, "source"),
        experienceLevel: null,
        salary: parseSalary(j.salary),
        postedAt: j.publication_date ? new Date(`${j.publication_date}Z`).toISOString() : null,
        industry: j.category || null,
        tags: j.tags ?? [],
        description: htmlToText(j.description ?? ""),
        visaSponsorship: null,
        descriptionComplete: true,
        alsoListedOn: [],
      });
    });
    await cacheSet(KEY, jobs);
    return { jobs, stale: false };
  } catch (e) {
    const stale = await cacheGetStale<Job[]>(KEY);
    if (stale) return { jobs: stale.value, stale: true };
    throw e;
  }
}

const remotive: Provider = {
  id: "remotive",
  name: "Remotive",
  homepage: "https://remotive.com",
  needsKey: null,
  configured: () => true,
  countries: () => null,
  async search(ctx) {
    const feed = await remotiveFeed();
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const jobs = feed.jobs.filter((j) => {
      if (j.postedAt && new Date(j.postedAt).getTime() > dayAgo) return false; // Remotive's 24h display delay
      const scope = j.location.remoteScopeCountries;
      return scope !== null && (scope.includes("*") || ctx.countries.some((c) => scope.includes(c)));
    });
    return {
      jobs,
      status: {
        provider: "remotive",
        name: "Remotive (remote jobs)",
        state: feed.stale ? "cached" : "ok",
        message: `${jobs.length} remote jobs open to applicants here${feed.stale ? " (service unavailable — showing the last saved results)" : ""}.`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Adzuna — official job search API (free developer key: ADZUNA_APP_ID + ADZUNA_APP_KEY).
// https://developer.adzuna.com
// ---------------------------------------------------------------------------

const ADZUNA_CURRENCY: Record<string, string> = {
  GB: "GBP", US: "USD", AT: "EUR", AU: "AUD", BE: "EUR", BR: "BRL", CA: "CAD", CH: "CHF", DE: "EUR", ES: "EUR", FR: "EUR",
  IN: "INR", IT: "EUR", MX: "MXN", NL: "EUR", NZ: "NZD", PL: "PLN", SG: "SGD", ZA: "ZAR",
};

interface AdzunaResult {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_type?: string;
  contract_time?: string;
  category?: { label?: string };
}

const adzuna: Provider = {
  id: "adzuna",
  name: "Adzuna",
  homepage: "https://www.adzuna.com",
  needsKey: "ADZUNA_APP_ID, ADZUNA_APP_KEY",
  configured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  countries: () => (process.env.ADZUNA_COUNTRIES ?? Object.keys(ADZUNA_CURRENCY).join(",")).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
  async search(ctx) {
    const supported = this.countries()!;
    const targets = ctx.countries.filter((c) => supported.includes(c)).slice(0, 8);
    const base: ProviderStatus = { provider: "adzuna", name: "Adzuna", state: "ok", message: "" };
    if (!targets.length) return { jobs: [], status: { ...base, state: "not_covered", message: "Adzuna doesn’t cover these countries." } };
    const jobs: Job[] = [];
    const errors: string[] = [];
    let usedCache = false;
    for (const cc of targets) {
      const params = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID!,
        app_key: process.env.ADZUNA_APP_KEY!,
        results_per_page: "50",
        "content-type": "application/json",
      });
      if (ctx.filters.title?.trim()) params.set("what", ctx.filters.title.trim());
      if (ctx.city) params.set("where", ctx.city);
      if (ctx.filters.postedWithinDays) params.set("max_days_old", String(ctx.filters.postedWithinDays));
      const url = `${process.env.ADZUNA_BASE_URL ?? "https://api.adzuna.com"}/v1/api/jobs/${cc.toLowerCase()}/search/1?${params}`;
      const key = `adzuna:${cc}:${params.get("what") ?? ""}:${params.get("where") ?? ""}:${params.get("max_days_old") ?? ""}`;
      let results: AdzunaResult[];
      const cached = await cacheGet<AdzunaResult[]>(key, 60 * 60 * 1000);
      if (cached) {
        results = cached.value;
        usedCache = true;
      } else {
        try {
          results = ((await getJson(url)) as { results: AdzunaResult[] }).results ?? [];
          await cacheSet(key, results);
        } catch (e) {
          const stale = await cacheGetStale<AdzunaResult[]>(key);
          errors.push(`${countryName(cc)}: ${(e as Error).message}`);
          if (!stale) continue;
          results = stale.value;
          usedCache = true;
        }
      }
      for (const r of results) {
        const loc = resolveLocation(r.location?.display_name ?? null, [cc]);
        const predicted = String(r.salary_is_predicted ?? "0") === "1";
        const types = employmentFromLabels([r.contract_time ?? "", r.contract_type ?? ""]);
        const hasSalary = !predicted && (r.salary_min || r.salary_max);
        jobs.push(
          finish({
            id: `adzuna:${r.id}`,
            provider: "adzuna",
            providerName: "Adzuna",
            sourceLabel: "Adzuna",
            url: r.redirect_url,
            title: htmlToText(r.title),
            company: r.company?.display_name || null,
            location: { ...emptyLoc, raw: r.location?.display_name ?? null, city: loc.city, countryCode: cc },
            workArrangement: null,
            employmentTypes: sourced(types, "source"),
            experienceLevel: null,
            // Adzuna's predicted salaries are estimates, not published figures, so they're not shown.
            salary: hasSalary
              ? {
                  text: [r.salary_min, r.salary_max].filter(Boolean).map((n) => Math.round(n!).toLocaleString("en")).join(" – ") + ` ${ADZUNA_CURRENCY[cc] ?? ""} per year`,
                  min: r.salary_min ?? r.salary_max ?? null,
                  max: r.salary_max ?? r.salary_min ?? null,
                  currency: ADZUNA_CURRENCY[cc] ?? null,
                  period: "year",
                }
              : null,
            postedAt: r.created ?? null,
            industry: r.category?.label && !/unknown/i.test(r.category.label) ? r.category.label : null,
            tags: [],
            description: htmlToText(r.description ?? ""),
            visaSponsorship: null,
            descriptionComplete: false,
            alsoListedOn: [],
          }),
        );
      }
    }
    const state: ProviderStatus["state"] = errors.length && !jobs.length ? "error" : usedCache && errors.length ? "cached" : "ok";
    return {
      jobs,
      status: {
        ...base,
        state,
        message: `${jobs.length} listings (summaries only; open the posting for the full text).${errors.length ? ` Problems: ${errors.join("; ")}` : ""}`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Jooble — official REST API. Keys are per country domain: JOOBLE_KEYS="FI:key,DE:key".
// Free keys have a lifetime limit of 500 requests, so results are cached for 24 hours.
// https://jooble.org/api/about
// ---------------------------------------------------------------------------

interface JoobleJob {
  id: number | string;
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
}

const JOOBLE_LIFETIME_LIMIT = 500;

function joobleKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (process.env.JOOBLE_KEYS ?? "").split(",")) {
    const [cc, key] = pair.split(":").map((s) => s?.trim());
    if (cc && key) out[cc.toUpperCase()] = key;
  }
  return out;
}

const jooble: Provider = {
  id: "jooble",
  name: "Jooble",
  homepage: "https://jooble.org",
  needsKey: "JOOBLE_KEYS",
  configured: () => Object.keys(joobleKeys()).length > 0,
  countries: () => Object.keys(joobleKeys()),
  async search(ctx) {
    const keys = joobleKeys();
    const targets = ctx.countries.filter((c) => keys[c]);
    const base: ProviderStatus = { provider: "jooble", name: "Jooble", state: "ok", message: "" };
    if (!targets.length) return { jobs: [], status: { ...base, state: "not_covered", message: `No Jooble key for ${ctx.countries.length === 1 ? countryName(ctx.countries[0]) : "these countries"}.` } };
    const jobs: Job[] = [];
    const notes: string[] = [];
    let limited = false;
    for (const cc of targets) {
      const body = {
        keywords: ctx.filters.title?.trim() ?? "",
        location: ctx.city ?? countryName(cc),
        page: 1,
        ResultOnPage: 50,
      };
      const key = `jooble:${cc}:${body.keywords}:${body.location}`;
      let list: JoobleJob[] | null = (await cacheGet<JoobleJob[]>(key, 24 * 3600 * 1000))?.value ?? null;
      if (!list) {
        const used = await counterGet(`jooble:used:${cc}`); // shared: the key's limit is for all users
        if (used >= JOOBLE_LIFETIME_LIMIT) {
          limited = true;
          list = (await cacheGetStale<JoobleJob[]>(key))?.value ?? [];
          notes.push(`${countryName(cc)}: key has reached Jooble’s 500-request lifetime limit`);
        } else {
          try {
            await counterSet(`jooble:used:${cc}`, used + 1);
            const d = (await getJson(`${process.env.JOOBLE_BASE_URL ?? "https://jooble.org"}/api/${encodeURIComponent(keys[cc])}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            })) as { jobs?: JoobleJob[] };
            list = d.jobs ?? [];
            await cacheSet(key, list);
            if (used + 1 >= JOOBLE_LIFETIME_LIMIT - 50) notes.push(`${countryName(cc)}: ${JOOBLE_LIFETIME_LIMIT - used - 1} requests left on this key`);
          } catch (e) {
            list = (await cacheGetStale<JoobleJob[]>(key))?.value ?? [];
            notes.push(`${countryName(cc)}: ${(e as Error).message}`);
          }
        }
      }
      for (const j of list) {
        const loc = resolveLocation(j.location, [cc]);
        jobs.push(
          finish({
            id: `jooble:${j.id}`,
            provider: "jooble",
            providerName: "Jooble",
            sourceLabel: j.source ? `${j.source} (via Jooble)` : "Jooble",
            url: j.link,
            title: htmlToText(j.title),
            company: j.company?.trim() || null,
            location: { ...emptyLoc, raw: j.location || null, city: loc.city, countryCode: loc.countryCode ?? cc },
            workArrangement: null,
            employmentTypes: sourced(employmentFromLabels([j.type ?? ""]), "source"),
            experienceLevel: null,
            salary: parseSalary(j.salary),
            postedAt: j.updated ? new Date(j.updated).toISOString() : null,
            industry: null,
            tags: [],
            description: htmlToText(j.snippet ?? ""),
            visaSponsorship: null,
            descriptionComplete: false,
            alsoListedOn: [],
          }),
        );
      }
    }
    return {
      jobs,
      status: { ...base, state: limited && !jobs.length ? "rate_limited" : notes.length && !jobs.length ? "error" : "ok", message: `${jobs.length} listings (summaries only).${notes.length ? ` ${notes.join("; ")}.` : ""}` },
    };
  },
};

// ---------------------------------------------------------------------------
// Jobicy — public remote-jobs API (no key). Terms: credit Jobicy with a link and send
// apply clicks to the original Jobicy URL; sync at most once an hour.
// https://jobicy.com/jobs-rss-feed
// ---------------------------------------------------------------------------

interface JobicyJob {
  id: string | number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobDescription?: string;
  jobExcerpt?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

const JOBICY_LEVEL: Record<string, Job["experienceLevel"]> = {
  junior: { value: "entry", from: "source" },
  midweight: { value: "mid", from: "source" },
  mid: { value: "mid", from: "source" },
  senior: { value: "senior", from: "source" },
  director: { value: "lead", from: "source" },
  lead: { value: "lead", from: "source" },
};

function jobicyPeriod(p: string | null | undefined): Salary["period"] {
  const s = (p ?? "").toLowerCase();
  if (/year|annual/.test(s)) return "year";
  if (/month/.test(s)) return "month";
  if (/hour/.test(s)) return "hour";
  if (/day|daily/.test(s)) return "day";
  return null;
}

async function jobicyFeed(): Promise<{ jobs: Job[]; stale: boolean }> {
  const KEY = "feed:jobicy";
  const fresh = await cacheGet<Job[]>(KEY, 60 * 60 * 1000);
  if (fresh) return { jobs: fresh.value, stale: false };
  try {
    const all: JobicyJob[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page++) {
      const url: string = `https://jobicy.com/api/jobs?count=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const d = (await getJson(url, undefined, 30000)) as { jobs: JobicyJob[]; nextCursor: string | null; hasMore: boolean };
      all.push(...d.jobs);
      if (!d.hasMore || !d.nextCursor) break;
      cursor = d.nextCursor;
    }
    const jobs = all.map((j): Job => {
      const arr = (v: string[] | string | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
      const scope = j.jobGeo?.trim() || null;
      const period = jobicyPeriod(j.salaryPeriod);
      const hasSalary = Boolean(j.salaryMin || j.salaryMax);
      return finish({
        id: `jobicy:${j.id}`,
        provider: "jobicy",
        providerName: "Jobicy",
        sourceLabel: "Jobicy",
        url: j.url,
        title: htmlToText(j.jobTitle),
        company: j.companyName?.trim() || null,
        location: { ...emptyLoc, remoteScope: scope, remoteScopeCountries: scope ? (/^anywhere$/i.test(scope) ? ["*"] : parseRemoteScope(scope)) : null },
        workArrangement: { value: "remote", from: "source" },
        employmentTypes: sourced(employmentFromLabels(arr(j.jobType)), "source"),
        experienceLevel: JOBICY_LEVEL[(j.jobLevel ?? "").toLowerCase()] ?? null,
        salary: hasSalary
          ? {
              text: `${[j.salaryMin, j.salaryMax].filter(Boolean).map((n) => Number(n).toLocaleString("en")).join(" – ")} ${j.salaryCurrency ?? ""}${period ? ` per ${period}` : ""}`.trim(),
              min: j.salaryMin ?? j.salaryMax ?? null,
              max: j.salaryMax ?? j.salaryMin ?? null,
              currency: j.salaryCurrency?.toUpperCase() ?? null,
              period,
            }
          : null,
        postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
        industry: arr(j.jobIndustry)[0] ? htmlToText(arr(j.jobIndustry)[0]) : null,
        tags: arr(j.jobIndustry).map(htmlToText),
        description: htmlToText(j.jobDescription ?? j.jobExcerpt ?? ""),
        visaSponsorship: null,
        descriptionComplete: Boolean(j.jobDescription),
        alsoListedOn: [],
      });
    });
    await cacheSet(KEY, jobs);
    return { jobs, stale: false };
  } catch (e) {
    const stale = await cacheGetStale<Job[]>(KEY);
    if (stale) return { jobs: stale.value, stale: true };
    throw e;
  }
}

const jobicy: Provider = {
  id: "jobicy",
  name: "Jobicy",
  homepage: "https://jobicy.com",
  needsKey: null,
  configured: () => true,
  countries: () => null,
  async search(ctx) {
    const feed = await jobicyFeed();
    const jobs = feed.jobs.filter((j) => {
      const scope = j.location.remoteScopeCountries;
      return scope !== null && (scope.includes("*") || ctx.countries.some((c) => scope.includes(c)));
    });
    return {
      jobs,
      status: {
        provider: "jobicy",
        name: "Jobicy (remote jobs)",
        state: feed.stale ? "cached" : "ok",
        message: `${jobs.length} remote jobs open to applicants here${feed.stale ? " (service unavailable — showing the last saved results)" : ""}.`,
      },
    };
  },
};

export const PROVIDERS: Provider[] = [arbeitnow, remotive, jobicy, adzuna, jooble];

export async function runProvider(p: Provider, ctx: SearchContext): Promise<ProviderResult> {
  if (!p.configured()) {
    return { jobs: [], status: { provider: p.id, name: p.name, state: "not_configured", message: `Add ${p.needsKey} to .env.local to enable.` } };
  }
  try {
    return await p.search(ctx);
  } catch (e) {
    const err = e as SourceError;
    return {
      jobs: [],
      status: { provider: p.id, name: p.name, state: err.rateLimited ? "rate_limited" : "error", message: err.message || "Unavailable right now." },
    };
  }
}
