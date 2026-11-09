// Shared job-search types (client + server).

export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";
export type ExperienceLevel = "internship" | "entry" | "mid" | "senior" | "lead";

/** A value plus where it came from, so the UI can say "from description" vs structured data. */
export interface Sourced<T> {
  value: T;
  from: "source" | "title" | "description";
}

export interface Salary {
  text: string; // exactly as published
  min: number | null;
  max: number | null;
  currency: string | null; // ISO code when identifiable
  period: "year" | "month" | "hour" | "day" | null;
}

export interface Job {
  id: string; // `${provider}:${providerId}`
  provider: ProviderId;
  providerName: string;
  /** Where this listing was found (for attribution); `url` is the original posting/apply link. */
  sourceLabel: string;
  url: string;
  title: string;
  company: string | null;
  location: {
    raw: string | null;
    city: string | null;
    countryCode: string | null;
    /** For remote jobs: who may apply, e.g. "Europe", "Worldwide" (as published). */
    remoteScope: string | null;
    remoteScopeCountries: string[] | null; // resolved ISO codes, ["*"] = worldwide
  };
  workArrangement: Sourced<WorkArrangement | "not_remote"> | null;
  employmentTypes: Sourced<EmploymentType[]> | null;
  experienceLevel: Sourced<ExperienceLevel> | null;
  salary: Salary | null;
  postedAt: string | null; // ISO
  industry: string | null;
  tags: string[];
  description: string; // plain text
  /** false when the source only provides a summary/snippet of the posting */
  descriptionComplete: boolean;
  qualifications: string[] | null; // lines from a requirements section of the description
  languagesRequired: string[] | null; // languages explicitly mentioned as required
  postingLanguage: string | null; // language the posting is written in
  visaSponsorship: boolean | null;
  /** Other sources that listed the same job (after de-duplication). */
  alsoListedOn: { provider: ProviderId; providerName: string; url: string }[];
}

export type ProviderId = "arbeitnow" | "remotive" | "jobicy" | "adzuna" | "jooble";

export type LocationQuery =
  | { type: "city"; city: string; countryCode: string }
  | { type: "country"; countryCode: string }
  | { type: "region"; regionId: string };

export interface JobFilters {
  title?: string;
  industry?: string;
  experience?: ExperienceLevel[];
  arrangement?: WorkArrangement[];
  employment?: EmploymentType[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  postedWithinDays?: number;
  company?: string;
  language?: string;
  visaSponsorship?: boolean;
  /** When true, jobs whose data can't confirm a selected filter are hidden instead of labelled. */
  strict?: boolean;
}

export type FilterKey = keyof Omit<JobFilters, "strict" | "salaryCurrency" | "salaryMax">;

export interface Compatibility {
  score: number; // 0-100
  label: string;
  reasons: string[];
  matchedTerms: string[];
  method: "keywords" | "ai";
  /** AI assessment details */
  essentials?: RequirementCheck[];
  niceToHave?: RequirementCheck[];
  concerns?: string[];
  allEssentialsMet?: boolean;
}

export interface RequirementCheck {
  requirement: string;
  status: "met" | "partial" | "not_met" | "unclear";
  evidence: string;
  evidenceVerified?: boolean;
}

export interface ResultJob extends Job {
  /** Filters this job's data couldn't confirm (shown as "not provided"). */
  unverifiedFilters: FilterKey[];
  compatibility: Compatibility | null;
  scope: "local" | "nationwide" | "regional" | "remote";
}

export interface ProviderStatus {
  provider: ProviderId;
  name: string;
  state: "ok" | "cached" | "not_configured" | "not_covered" | "error" | "rate_limited";
  message: string;
  countries?: string[];
}

export interface SearchResponse {
  location: LocationQuery & { label: string };
  countries: string[]; // countries searched
  sections: {
    local?: ResultJob[];
    nationwide?: ResultJob[];
    nationwideTotal?: number;
    regional?: ResultJob[];
    remote?: ResultJob[];
  };
  totals: { found: number; afterFilters: number; duplicatesRemoved: number };
  providers: ProviderStatus[];
  profile: { label: string } | null;
}

export interface ProfileOption {
  id: string; // "ws:<id>" or "lib:<id>"
  label: string;
  detail: string;
}

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};
export const ARRANGEMENT_LABEL: Record<WorkArrangement | "not_remote", string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  not_remote: "Not remote (on-site or hybrid)",
};
export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  internship: "Internship / student",
  entry: "Entry level / junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead / principal / manager",
};
