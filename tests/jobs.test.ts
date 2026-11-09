import { describe, expect, it } from "vitest";
import { annual, employmentFromLabels, experienceFromTitle, extractQualifications, parseSalary, postingLanguage, requiredLanguages } from "@/lib/jobs/extract";
import { evaluate } from "@/lib/jobs/filter";
import { keywordCompatibility, profileTerms } from "@/lib/jobs/match";
import type { Job } from "@/lib/jobs/types";
import { countryCodeFromName, resolveLocation, suggestLocations } from "@/lib/server/geo";
import { labelFor, scoreChecks } from "@/lib/server/jobs/assess";
import { parseRemoteScope } from "@/lib/server/jobs/providers";
import { dedupe } from "@/lib/server/jobs/search";
import { RESUME } from "./fixtures";

export function job(p: Partial<Job> = {}): Job {
  return {
    id: "x:1",
    provider: "arbeitnow",
    providerName: "Arbeitnow",
    sourceLabel: "Arbeitnow",
    url: "https://example.com/1",
    title: "Data Analyst",
    company: "Acme GmbH",
    location: { raw: "Berlin", city: "Berlin", countryCode: "DE", remoteScope: null, remoteScopeCountries: null },
    workArrangement: null,
    employmentTypes: null,
    experienceLevel: null,
    salary: null,
    postedAt: null,
    industry: null,
    tags: [],
    description: "We need SQL and Python.",
    descriptionComplete: true,
    qualifications: null,
    languagesRequired: null,
    postingLanguage: null,
    visaSponsorship: null,
    alsoListedOn: [],
    ...p,
  };
}

describe("geography", () => {
  it("resolves free-text posting locations to city + country", () => {
    expect(resolveLocation("Utrecht, Utrecht, Nederland")).toEqual({ city: "Utrecht", countryCode: "NL" });
    expect(resolveLocation("Zurich")).toEqual({ city: "Zürich", countryCode: "CH" });
    expect(resolveLocation("Munich, Bavaria, Germany")).toEqual({ city: "Munich", countryCode: "DE" });
    expect(resolveLocation("London, England, United Kingdom")).toEqual({ city: "London", countryCode: "GB" });
    expect(resolveLocation("Oulu")).toEqual({ city: "Oulu", countryCode: "FI" });
    expect(resolveLocation("Germany")).toEqual({ city: null, countryCode: "DE" });
    expect(resolveLocation("")).toEqual({ city: null, countryCode: null });
    expect(resolveLocation("Stuttgart Schockenriedstr. 17").countryCode).toBe("DE");
    // English names the dataset lacks must not resolve to small namesakes elsewhere.
    expect(resolveLocation("Cologne")).toEqual({ city: "Köln", countryCode: "DE" });
    expect(resolveLocation("Frankfurt").countryCode).toBe("DE");
    expect(resolveLocation("Geneva").countryCode).toBe("CH");
    expect(resolveLocation("Den Haag").countryCode).toBe("NL");
  });

  it("recognises country names in several languages, not 2-letter states", () => {
    expect(countryCodeFromName("Suomi")).toBe("FI");
    expect(countryCodeFromName("Deutschland")).toBe("DE");
    expect(countryCodeFromName("UK")).toBe("GB");
    expect(countryCodeFromName("CA")).toBeNull();
  });

  it("suggests cities, countries and regions", () => {
    const oulu = suggestLocations("Oulu");
    expect(oulu[0]).toMatchObject({ type: "city", city: "Oulu", countryCode: "FI" });
    expect(suggestLocations("Finl").some((s) => s.type === "country" && s.countryCode === "FI")).toBe(true);
    expect(suggestLocations("Europe")[0]).toMatchObject({ type: "region", regionId: "europe" });
  });

  it("parses remote eligibility text", () => {
    expect(parseRemoteScope("Worldwide")).toEqual(["*"]);
    expect(parseRemoteScope("Europe, USA")).toEqual(expect.arrayContaining(["FI", "DE", "US"]));
    expect(parseRemoteScope("UK")).toEqual(["GB"]);
    expect(parseRemoteScope("CET +/- 3 hours")).toBeNull();
  });
});

describe("field extraction", () => {
  it("maps provider job types", () => {
    expect(employmentFromLabels(["Full Time"])).toEqual(["full_time"]);
    expect(employmentFromLabels(["Unbefristeter arbeitsvertrag"])).toEqual([]);
    expect(employmentFromLabels(["Befristeter arbeitsvertrag"])).toEqual(["temporary"]);
    expect(employmentFromLabels(["freelance"])).toEqual(["contract"]);
    expect(employmentFromLabels(["fulltime fixed term"]).sort()).toEqual(["full_time", "temporary"]);
  });

  it("reads experience level from explicit title words only", () => {
    expect(experienceFromTitle("Senior Data Engineer")).toBe("senior");
    expect(experienceFromTitle("Junior Analyst")).toBe("entry");
    expect(experienceFromTitle("Werkstudent Marketing")).toBe("internship");
    expect(experienceFromTitle("Product Manager")).toBeNull();
    expect(experienceFromTitle("Data Analyst")).toBeNull();
  });

  it("parses published salaries without inventing currency", () => {
    expect(parseSalary("$20k -$35k")).toMatchObject({ min: 20000, max: 35000, currency: "USD", period: "year" });
    expect(parseSalary("$3.5k–$5k/month")).toMatchObject({ min: 3500, max: 5000, period: "month" });
    expect(parseSalary("70K-80K")).toMatchObject({ min: 70000, max: 80000, currency: null });
    expect(parseSalary("€52,000 - €60,000 per year")).toMatchObject({ min: 52000, max: 60000, currency: "EUR" });
    expect(parseSalary("")).toBeNull();
    expect(parseSalary("Competitive")).toBeNull();
    expect(annual(5000, "month")).toBe(60000);
    expect(annual(30, "hour")).toBeNull();
  });

  it("extracts a requirements section verbatim", () => {
    const d = "About us\nWe build things.\nRequirements:\n- 2+ years SQL\n- Python\nWhat we offer\n- Free coffee";
    expect(extractQualifications(d)).toEqual(["2+ years SQL", "Python"]);
    expect(extractQualifications("No sections here.")).toBeNull();
  });

  it("detects explicitly required languages and the posting language", () => {
    expect(requiredLanguages("Fluent English and good Finnish skills required.")?.sort()).toEqual(["English", "Finnish"]);
    expect(requiredLanguages("We are an English company.")).toBeNull();
    const de = "Wir suchen dich für unser Team und du bist mit der Arbeit vertraut. Die Aufgaben sind spannend und wir bieten dir viel. ".repeat(3);
    expect(postingLanguage(de)).toBe("German");
  });
});

describe("filters", () => {
  it("does not restrict unselected filters", () => {
    expect(evaluate(job(), {})).toEqual({ excluded: false, unverified: [] });
  });

  it("excludes clear mismatches and labels missing data", () => {
    const remote = job({ workArrangement: { value: "remote", from: "source" } });
    expect(evaluate(remote, { arrangement: ["onsite"] }).excluded).toBe(true);
    expect(evaluate(remote, { arrangement: ["remote"] })).toEqual({ excluded: false, unverified: [] });
    expect(evaluate(job(), { arrangement: ["hybrid"] })).toEqual({ excluded: false, unverified: ["arrangement"] });
    expect(evaluate(job(), { arrangement: ["hybrid"], strict: true }).excluded).toBe(true);
    const notRemote = job({ workArrangement: { value: "not_remote", from: "source" } });
    expect(evaluate(notRemote, { arrangement: ["remote"] }).excluded).toBe(true);
    expect(evaluate(notRemote, { arrangement: ["onsite"] }).unverified).toEqual(["arrangement"]);
  });

  it("compares salary only in the same currency and known period", () => {
    const eur = job({ salary: { text: "€4,000/month", min: 4000, max: 4000, currency: "EUR", period: "month" } });
    expect(evaluate(eur, { salaryMin: 45000, salaryCurrency: "EUR" }).excluded).toBe(false);
    expect(evaluate(eur, { salaryMin: 50000, salaryCurrency: "EUR" }).excluded).toBe(true);
    expect(evaluate(eur, { salaryMin: 45000, salaryCurrency: "USD" }).unverified).toEqual(["salaryMin"]);
  });

  it("filters by title, date posted and visa sponsorship", () => {
    expect(evaluate(job(), { title: "data analyst" }).excluded).toBe(false);
    expect(evaluate(job(), { title: "designer" }).excluded).toBe(true);
    const old = job({ postedAt: new Date(Date.now() - 10 * 86400000).toISOString() });
    expect(evaluate(old, { postedWithinDays: 7 }).excluded).toBe(true);
    expect(evaluate(job({ visaSponsorship: true }), { visaSponsorship: true }).excluded).toBe(false);
    expect(evaluate(job(), { visaSponsorship: true }).unverified).toEqual(["visaSponsorship"]);
  });
});

describe("dedupe", () => {
  it("merges the same job from two sources, keeping the full description", () => {
    const a = job({ id: "adzuna:1", provider: "adzuna", sourceLabel: "Adzuna", url: "https://a/1", descriptionComplete: false, description: "short", title: "Data Analyst (m/w/d)" });
    const b = job({ id: "arbeitnow:1", url: "https://b/1", description: "full text", company: "Acme" });
    const { jobs, removed } = dedupe([a, b]);
    expect(removed).toBe(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("arbeitnow:1");
    expect(jobs[0].alsoListedOn.map((x) => x.url)).toEqual(["https://a/1"]);
  });
});

describe("compatibility", () => {
  it("extracts profile terms from the resume", () => {
    expect(profileTerms(RESUME)).toEqual(expect.arrayContaining(["Excel", "SQL", "Python", "Tableau"]));
  });

  it("keyword compatibility explains matches and never says perfect", () => {
    const c = keywordCompatibility(job({ title: "Data Analyst", description: "Requirements: SQL, Python, Tableau, dbt and AWS." }), RESUME);
    expect(c.matchedTerms).toEqual(expect.arrayContaining(["SQL", "Python", "Tableau"]));
    expect(c.reasons.join(" ")).toContain("AWS");
    expect(c.label.toLowerCase()).not.toContain("perfect");
  });

  it("a single matching word and a title word from a bullet don't make a strong match", () => {
    // "sales" appears in a bullet ("weekly sales reports"), not in any role the user held.
    const sales = keywordCompatibility(job({ title: "Regional Sales Director", description: "Lead our sales team. Excel skills." }), RESUME);
    expect(sales.score).toBeLessThan(25);
    expect(sales.reasons.join(" ")).not.toContain("Job title overlaps");
    const analyst = keywordCompatibility(job({ title: "Data Analyst", description: "SQL, Python, Tableau and Excel reporting." }), RESUME);
    expect(analyst.score).toBeGreaterThan(sales.score + 30);
    expect(analyst.reasons.join(" ")).toContain("Job title overlaps with your experience (data, analyst)");
  });

  it("AI labels: 'all essentials met' only when every essential is met", () => {
    const met = { requirement: "SQL", status: "met" as const, evidence: "SQL", evidenceVerified: true };
    const partial = { ...met, status: "partial" as const };
    expect(scoreChecks([met, met], [])).toBe(100);
    expect(scoreChecks([met, partial], [])).toBe(75);
    expect(labelFor(100, true)).toBe("All essential qualifications met");
    expect(labelFor(100, false)).toBe("Strong match");
  });
});
