import { annual } from "./extract";
import type { FilterKey, Job, JobFilters } from "./types";

// Filters only restrict what the user selected. For each selected filter a job either
// matches, clearly doesn't match (excluded), or its data doesn't say (kept but labelled,
// or excluded in strict mode). Nothing is guessed to make a job pass or fail.

type Verdict = "match" | "mismatch" | "unknown";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function textHasAll(haystack: string, query: string): boolean {
  const h = fold(haystack);
  return fold(query)
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1)
    .every((w) => h.includes(w));
}

export function evaluate(job: Job, f: JobFilters, now = Date.now()): { excluded: boolean; unverified: FilterKey[] } {
  const verdicts: [FilterKey, Verdict][] = [];

  if (f.title?.trim()) verdicts.push(["title", textHasAll(job.title, f.title) ? "match" : "mismatch"]);

  if (f.industry?.trim()) {
    const src = [job.industry, ...job.tags].filter(Boolean).join(" ");
    verdicts.push(["industry", !src ? "unknown" : textHasAll(src, f.industry) || textHasAll(job.title, f.industry) ? "match" : "mismatch"]);
  }

  if (f.company?.trim()) verdicts.push(["company", !job.company ? "unknown" : fold(job.company).includes(fold(f.company.trim())) ? "match" : "mismatch"]);

  if (f.experience?.length) verdicts.push(["experience", !job.experienceLevel ? "unknown" : f.experience.includes(job.experienceLevel.value) ? "match" : "mismatch"]);

  if (f.arrangement?.length) {
    const a = job.workArrangement?.value;
    let v: Verdict;
    if (!a) v = "unknown";
    else if (a === "not_remote") v = f.arrangement.some((x) => x !== "remote") ? "unknown" : "mismatch";
    else v = f.arrangement.includes(a) ? "match" : "mismatch";
    verdicts.push(["arrangement", v]);
  }

  if (f.employment?.length) {
    const types = job.employmentTypes?.value;
    verdicts.push(["employment", !types ? "unknown" : types.some((t) => f.employment!.includes(t)) ? "match" : "mismatch"]);
  }

  if (f.salaryMin || f.salaryMax) {
    const s = job.salary;
    let v: Verdict = "unknown";
    if (s && s.currency && (!f.salaryCurrency || s.currency === f.salaryCurrency)) {
      const lo = annual(s.min, s.period);
      const hi = annual(s.max, s.period) ?? lo;
      if (lo !== null && hi !== null) {
        const okMin = !f.salaryMin || hi >= f.salaryMin;
        const okMax = !f.salaryMax || lo <= f.salaryMax;
        v = okMin && okMax ? "match" : "mismatch";
      }
    }
    // A salary in another currency is "unknown", not converted at a guessed rate.
    verdicts.push(["salaryMin", v]);
  }

  if (f.postedWithinDays) {
    verdicts.push([
      "postedWithinDays",
      !job.postedAt ? "unknown" : now - new Date(job.postedAt).getTime() <= f.postedWithinDays * 86400000 ? "match" : "mismatch",
    ]);
  }

  if (f.language?.trim()) {
    const req = job.languagesRequired;
    const lang = f.language.trim();
    let v: Verdict = "unknown";
    if (req?.length) v = req.some((l) => l.toLowerCase() === lang.toLowerCase()) ? "match" : "mismatch";
    verdicts.push(["language", v]);
  }

  if (f.visaSponsorship !== undefined) {
    const vs = job.visaSponsorship;
    verdicts.push(["visaSponsorship", vs === null ? "unknown" : vs === f.visaSponsorship ? "match" : "mismatch"]);
  }

  const unverified = verdicts.filter(([, v]) => v === "unknown").map(([k]) => k);
  const excluded = verdicts.some(([, v]) => v === "mismatch") || (Boolean(f.strict) && unverified.length > 0);
  return { excluded, unverified };
}

export const FILTER_LABEL: Record<FilterKey, string> = {
  title: "Job title",
  industry: "Industry",
  company: "Company",
  experience: "Experience level",
  arrangement: "Work arrangement",
  employment: "Employment type",
  salaryMin: "Salary",
  postedWithinDays: "Date posted",
  language: "Required language",
  visaSponsorship: "Visa sponsorship",
};
