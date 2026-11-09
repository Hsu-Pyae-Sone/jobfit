"use client";

import Checkbox from "@mui/material/Checkbox";
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, type EmploymentType, type ExperienceLevel, type JobFilters, type WorkArrangement } from "@/lib/jobs/types";
import { Input, Label, cx, Select } from "../ui";

function Chips<T extends string>({ options, value, onChange, label }: { options: Record<T, string>; value: T[] | undefined; onChange: (v: T[] | undefined) => void; label: string }) {
  const cur = value ?? [];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as T[]).map((k) => {
          const on = cur.includes(k);
          return (
            <button
              type="button"
              key={k}
              aria-pressed={on}
              onClick={() => {
                const next = on ? cur.filter((x) => x !== k) : [...cur, k];
                onChange(next.length ? next : undefined);
              }}
              className={cx("rounded-full border px-2.5 py-1 text-xs", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:border-ink-2")}
            >
              {options[k]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const ARRANGEMENTS: Record<WorkArrangement, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const LANGUAGES = ["English", "Finnish", "Swedish", "German", "French", "Dutch", "Spanish", "Italian", "Polish", "Portuguese", "Norwegian", "Danish"];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD", "INR"];

export function countActive(f: JobFilters): number {
  return [f.title, f.industry, f.company, f.language, f.experience?.length, f.arrangement?.length, f.employment?.length, f.salaryMin || f.salaryMax, f.postedWithinDays, f.visaSponsorship !== undefined].filter(Boolean).length;
}

export function FiltersPanel({ value, onChange }: { value: JobFilters; onChange: (f: JobFilters) => void }) {
  const set = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) => onChange({ ...value, [k]: v === "" ? undefined : v });
  const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Number(s.replace(/[^\d.]/g, "")) || 0));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="f-title">Job title</Label>
          <Input id="f-title" value={value.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Data analyst" />
        </div>
        <div>
          <Label htmlFor="f-industry">Industry</Label>
          <Input id="f-industry" value={value.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Healthcare, Software" />
        </div>
        <div>
          <Label htmlFor="f-company">Company</Label>
          <Input id="f-company" value={value.company ?? ""} onChange={(e) => set("company", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="f-date">Date posted</Label>
          <Select id="f-date" value={value.postedWithinDays ?? ""} onChange={(e) => set("postedWithinDays", e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Any time</option>
            <option value="1">Past 24 hours</option>
            <option value="3">Past 3 days</option>
            <option value="7">Past week</option>
            <option value="14">Past 2 weeks</option>
            <option value="30">Past month</option>
          </Select>
        </div>
      </div>

      <Chips label="Experience level" options={EXPERIENCE_LABEL as Record<ExperienceLevel, string>} value={value.experience} onChange={(v) => set("experience", v)} />
      <Chips label="Work arrangement" options={ARRANGEMENTS} value={value.arrangement} onChange={(v) => set("arrangement", v)} />
      <Chips label="Employment type" options={EMPLOYMENT_LABEL as Record<EmploymentType, string>} value={value.employment} onChange={(v) => set("employment", v)} />

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Salary (per year)</legend>
        <div className="grid grid-cols-[1fr_1fr_90px] gap-2">
          <Input aria-label="Minimum salary" inputMode="numeric" placeholder="Min" value={value.salaryMin ?? ""} onChange={(e) => set("salaryMin", num(e.target.value))} />
          <Input aria-label="Maximum salary" inputMode="numeric" placeholder="Max" value={value.salaryMax ?? ""} onChange={(e) => set("salaryMax", num(e.target.value))} />
          <Select aria-label="Currency" value={value.salaryCurrency ?? "EUR"} onChange={(e) => set("salaryCurrency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <p className="mt-1 text-xs text-muted">Salaries in other currencies aren’t converted; they count as “not provided”.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="f-lang">Required language</Label>
          <Select id="f-lang" value={value.language ?? ""} onChange={(e) => set("language", e.target.value || undefined)}>
            <option value="">Any</option>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-visa">Visa sponsorship</Label>
          <Select
            id="f-visa"
            value={value.visaSponsorship === undefined ? "" : "yes"}
            onChange={(e) => set("visaSponsorship", e.target.value === "yes" ? true : undefined)}
          >
            <option value="">Any</option>
            <option value="yes">Offers visa sponsorship</option>
          </Select>
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg bg-black/[0.03] px-3 py-2.5 text-sm text-ink-2">
        <Checkbox size="small" sx={{ p: 0.25 }} checked={Boolean(value.strict)} onChange={(e) => set("strict", e.target.checked || undefined)} />
        <span>
          Hide jobs that don’t state the information a filter needs.
          <span className="block text-xs text-muted">Off: they stay in the results, marked “not provided”. Many postings don’t publish salary or work arrangement.</span>
        </span>
      </label>
    </div>
  );
}
