"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, KeyRound, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { Compatibility, JobFilters, ProfileOption, ProviderStatus, ResultJob, SearchResponse } from "@/lib/jobs/types";
import { Alert, Badge, Button, Card, Spinner, cx, Select } from "../ui";
import { countActive, FiltersPanel } from "./Filters";
import { JobCard } from "./JobCard";
import { LocationPicker, type LocationChoice } from "./LocationPicker";

interface SourceInfo {
  id: string;
  name: string;
  homepage: string;
  configured: boolean;
  needsKey: string | null;
}

const STORE_KEY = "careerfit.search";
function load(): { location: LocationChoice | null; filters: JobFilters; profileId: string } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (v) return { location: v.location ?? null, filters: v.filters ?? {}, profileId: v.profileId ?? "" };
  } catch {
    /* storage unavailable */
  }
  return { location: null, filters: {}, profileId: "" };
}

const STATE_UI: Record<ProviderStatus["state"], { icon: typeof CheckCircle2; cls: string }> = {
  ok: { icon: CheckCircle2, cls: "text-add-ink" },
  cached: { icon: AlertTriangle, cls: "text-mod-ink" },
  not_configured: { icon: KeyRound, cls: "text-muted" },
  not_covered: { icon: CircleOff, cls: "text-muted" },
  error: { icon: AlertTriangle, cls: "text-del-ink" },
  rate_limited: { icon: AlertTriangle, cls: "text-del-ink" },
};

function Section({
  title,
  subtitle,
  jobs,
  onTailor,
  onMatch,
  showCountry,
  footer,
  assess,
}: {
  title: string;
  subtitle: string;
  jobs: ResultJob[];
  onTailor: (j: ResultJob) => void;
  onMatch: (j: ResultJob) => void;
  showCountry?: boolean;
  footer?: React.ReactNode;
  assess?: React.ReactNode;
}) {
  const [shown, setShown] = useState(20);
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {assess}
      </div>
      {jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No jobs found here with the current filters and sources.</p>
      ) : (
        <div className="space-y-3">
          {jobs.slice(0, shown).map((j) => (
            <JobCard key={j.id} job={j} onTailor={onTailor} onMatch={onMatch} countryLabel={showCountry && j.location.countryCode ? j.location.countryCode : undefined} />
          ))}
          {jobs.length > shown && (
            <div className="text-center">
              <Button variant="ghost" onClick={() => setShown((s) => s + 20)}>
                Show more ({jobs.length - shown} more)
              </Button>
            </div>
          )}
        </div>
      )}
      {footer}
    </section>
  );
}

export function JobSearch() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [filters, setFilters] = useState<JobFilters>({});
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [assessing, setAssessing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiConfigured, setAi] = useState(false);

  useEffect(() => {
    const saved = load();
    api<{ profiles: ProfileOption[]; sources: SourceInfo[] }>("/api/jobs/profiles").then((r) => {
      // Restore the last search (per-browser convenience) once we know which resumes exist.
      setLocation((cur) => cur ?? saved.location);
      setFilters((cur) => (Object.keys(cur).length ? cur : saved.filters));
      setProfiles(r.profiles);
      setSources(r.sources);
      setProfileId(r.profiles.some((p) => p.id === saved.profileId) ? saved.profileId : "");
    });
    api<{ aiConfigured: boolean }>("/api/status").then((r) => setAi(r.aiConfigured));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ location, filters, profileId }));
    } catch {
      /* storage unavailable */
    }
  }, [location, filters, profileId]);

  async function search(loc = location) {
    if (!loc) return;
    setBusy(true);
    setErr(null);
    try {
      const f: JobFilters = { ...filters, salaryCurrency: filters.salaryMin || filters.salaryMax ? (filters.salaryCurrency ?? "EUR") : undefined };
      setResult(await api<SearchResponse>("/api/jobs/search", { body: { location: loc.query, filters: f, profileId: profileId || null } }));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function showAllInCountry() {
    if (!result || location?.query.type !== "city") return;
    const cc = location.query.countryCode;
    const next: LocationChoice = { query: { type: "country", countryCode: cc }, label: location.detail, detail: "Country" };
    setLocation(next);
    await search(next);
  }

  async function assess(jobs: ResultJob[], key: string) {
    if (!profileId) return;
    setAssessing(key);
    setErr(null);
    try {
      const r = await api<{ results: Record<string, Compatibility>; errors: string[] }>("/api/jobs/assess", { body: { jobIds: jobs.slice(0, 10).map((j) => j.id), profileId } });
      if (r.errors.length) setErr(`Some assessments failed: ${r.errors[0]}`);
      setResult((cur) => {
        if (!cur) return cur;
        const upd = (l?: ResultJob[]) =>
          l
            ?.map((j) => (r.results[j.id] ? { ...j, compatibility: r.results[j.id] } : j))
            .sort((a, b) => (b.compatibility?.score ?? 0) - (a.compatibility?.score ?? 0));
        return { ...cur, sections: { ...cur.sections, local: upd(cur.sections.local), nationwide: upd(cur.sections.nationwide), regional: upd(cur.sections.regional), remote: upd(cur.sections.remote) } };
      });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setAssessing(null);
    }
  }

  async function analyzeMatch(job: ResultJob) {
    if (!profileId) {
      setErr("Choose a resume in “Rank by” first, so the job can be compared with it.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      const r = await api<{ match: { id: string } }>("/api/match", { body: { source: { kind: "search", jobId: job.id }, profileId } });
      router.push(`/match/${r.match.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function tailor(job: ResultJob) {
    try {
      const r = await api<{ workspaceId: string }>(`/api/jobs/${encodeURIComponent(job.id)}/to-studio`, { body: { profileId: profileId || null } });
      router.push(`/studio/${r.workspaceId}?step=inputs`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  const assessButton = (jobs: ResultJob[] | undefined, key: string) =>
    profileId && aiConfigured && jobs?.length ? (
      <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />} loading={assessing === key} disabled={assessing !== null} onClick={() => assess(jobs, key)}>
        Assess top {Math.min(10, jobs.length)} with AI
      </Button>
    ) : null;

  const active = countActive(filters);
  const s = result?.sections;
  const loc = result?.location;
  const countryName = useMemo(() => (location?.query.type === "city" ? location.detail : location?.label), [location]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Job Explorer</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Find jobs that fit you</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Real listings from official job APIs and public feeds — never generated. Choose a location, add any filters you want, and optionally rank
        results against one of your verified resumes.
      </p>

      <Card className="mt-6 p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
        >
          <LocationPicker value={location} onChange={setLocation} />
          <Select
            aria-label="Rank results by resume"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            >
            <option value="">Don’t rank by resume</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                Rank by: {p.label} ({p.detail})
              </option>
            ))}
          </Select>
          <Button type="button" className="h-10" onClick={() => setShowFilters((v) => !v)} icon={<SlidersHorizontal className="size-4" />} aria-expanded={showFilters}>
            Filters{active ? ` (${active})` : ""}
          </Button>
          <Button type="submit" variant="primary" className="h-10" disabled={!location} loading={busy} icon={<Search className="size-4" />}>
            Search
          </Button>
        </form>
        {!location && <p className="mt-2 text-xs text-muted">A location is required. Start typing a city, country or continent.</p>}
        {profiles.length === 0 && (
          <p className="mt-2 text-xs text-muted">To rank jobs by compatibility, confirm a resume in the Studio or save one to the Library first.</p>
        )}
        {showFilters && (
          <div className="mt-5 border-t border-line pt-5">
            <FiltersPanel value={filters} onChange={setFilters} />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            </div>
          </div>
        )}
      </Card>

      {err && (
        <Alert kind="error" className="mt-6">
          {err}
        </Alert>
      )}

      {busy && (
        <div className="mt-10 text-center">
          <Spinner label="Searching job sources…" />
        </div>
      )}

      {result && !busy && loc && s && (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div>
              <p className="text-sm text-ink-2">
                <span className="font-semibold text-ink">{result.totals.afterFilters}</span> jobs for <span className="font-semibold text-ink">{loc.label}</span>
                {result.totals.duplicatesRemoved > 0 && <> · {result.totals.duplicatesRemoved} duplicates merged</>}
                {result.profile && <> · ranked against “{result.profile.label}”</>}
              </p>
              {result.profile && (
                <p className="mt-1 text-xs text-muted">
                  Keyword match compares terms from your resume with each posting. “Assess with AI” checks each requirement against your resume; only
                  that can show all essential qualifications are met.
                </p>
              )}
            </div>
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sources for this search</p>
              <ul className="space-y-1.5">
                {result.providers.map((p) => {
                  const ui = STATE_UI[p.state];
                  const Icon = ui.icon;
                  const src = sources.find((x) => x.id === p.provider);
                  return (
                    <li key={p.provider} className="flex gap-2 text-xs">
                      <Icon className={cx("mt-px size-3.5 shrink-0", ui.cls)} aria-hidden />
                      <span>
                        {src ? (
                          <a href={src.homepage} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
                            {p.name}
                          </a>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}{" "}
                        <span className="text-muted">— {p.message}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          {result.totals.found === 0 && (
            <Alert kind="info" className="mt-6" title={`No listings available for ${loc.label} from the connected sources`}>
              The free sources mainly cover Western Europe and remote work. Other countries (including Finland) need an Adzuna or Jooble API key, which the server administrator can add — see the notes under “Sources”.
            </Alert>
          )}

          {loc.type === "city" && (
            <Section
              title={`In ${loc.city}`}
              subtitle="Jobs located in this city."
              jobs={s.local ?? []}
              onTailor={tailor} onMatch={analyzeMatch}
              assess={assessButton(s.local, "local")}
            />
          )}
          {loc.type === "city" && (
            <Section
              title={`Elsewhere in ${countryName}`}
              subtitle={`Up to five of the most relevant jobs in other parts of ${countryName}.`}
              jobs={s.nationwide ?? []}
              onTailor={tailor} onMatch={analyzeMatch}
              assess={assessButton(s.nationwide, "nationwide")}
              footer={
                (s.nationwideTotal ?? 0) > 0 && (
                  <div className="mt-3 text-center">
                    <Button onClick={showAllInCountry}>Show all jobs in {countryName} ({s.nationwideTotal! + (s.local?.length ?? 0)})</Button>
                  </div>
                )
              }
            />
          )}
          {loc.type === "country" && (
            <Section title={`Across ${loc.label}`} subtitle="Nationwide results." jobs={s.nationwide ?? []} onTailor={tailor} onMatch={analyzeMatch} assess={assessButton(s.nationwide, "nationwide")} />
          )}
          {loc.type === "region" && (
            <Section
              title={`Across ${loc.label}`}
              subtitle={`Regional results from the supported countries in ${loc.label}: ${[...new Set((s.regional ?? []).map((j) => j.location.countryCode))].filter(Boolean).join(", ") || "none found"}.`}
              jobs={s.regional ?? []}
              onTailor={tailor} onMatch={analyzeMatch}
              showCountry
              assess={assessButton(s.regional, "regional")}
            />
          )}
          <Section
            title="Remote jobs open to you here"
            subtitle={`Fully remote roles whose employers accept applicants from ${loc.type === "city" ? countryName : loc.label}.`}
            jobs={s.remote ?? []}
            onTailor={tailor} onMatch={analyzeMatch}
            assess={assessButton(s.remote, "remote")}
          />

          <p className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Listings come from{" "}
            {sources
              .filter((x) => x.configured)
              .map((x, i, arr) => (
                <span key={x.id}>
                  <a href={x.homepage} target="_blank" rel="noopener noreferrer" className="underline">
                    {x.name}
                  </a>
                  {i < arr.length - 1 ? ", " : ""}
                </span>
              ))}
            . Always apply through the original posting. Remotive listings are shown 24 hours after publication, per Remotive’s terms. Place names: GeoNames (CC BY 4.0).
            {sources.some((x) => !x.configured) && (
              <> Not connected: {sources.filter((x) => !x.configured).map((x) => `${x.name} (set ${x.needsKey})`).join(", ")}.</>
            )}
          </p>
        </>
      )}

      {!result && !busy && (
        <div className="mt-8 grid gap-3 text-sm text-ink-2 sm:grid-cols-3">
          {[
            ["City", "Jobs in the city first, plus up to five strong options elsewhere in the country."],
            ["Country", "Every job the sources have nationwide."],
            ["Continent or region", "Combined results from the supported countries in that region."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-dashed border-line-strong p-4">
              <Badge tone="brand">{t}</Badge>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
