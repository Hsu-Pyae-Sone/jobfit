"use client";

import { useState } from "react";
import { BadgeCheck, Briefcase, Building2, CalendarDays, ChevronDown, CircleDashed, CircleMinus, CircleHelp, Clock, ExternalLink, FileText, Laptop, MapPin, Wallet } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { FILTER_LABEL } from "@/lib/jobs/filter";
import { ARRANGEMENT_LABEL, EMPLOYMENT_LABEL, EXPERIENCE_LABEL, type RequirementCheck, type ResultJob } from "@/lib/jobs/types";
import { Badge, Button, cx } from "../ui";

const NP = <span className="text-muted">Not provided</span>;

function posted(iso: string | null) {
  if (!iso) return NP;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const rel = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return (
    <span title={new Date(iso).toLocaleString()}>
      {new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {rel}
    </span>
  );
}

const FROM_NOTE = { source: "", title: " (from job title)", description: " (stated in description)" };

function Field({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-[13px]">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  );
}

const SCOPE_BADGE = {
  local: { label: "Local", tone: "brand" as const },
  nationwide: { label: "Nationwide", tone: "neutral" as const },
  regional: { label: "Regional", tone: "move" as const },
  remote: { label: "Remote", tone: "add" as const },
};

const STATUS_ICON = { met: [BadgeCheck, "text-add-ink"], partial: [CircleDashed, "text-mod-ink"], not_met: [CircleMinus, "text-del-ink"], unclear: [CircleHelp, "text-muted"] } as const;

function Checks({ title, list }: { title: string; list: RequirementCheck[] }) {
  if (!list.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="space-y-1.5">
        {list.map((c, i) => {
          const [Icon, cls] = STATUS_ICON[c.status];
          return (
            <li key={i} className="flex gap-2 text-[13px]">
              <Icon className={cx("mt-0.5 size-4 shrink-0", cls)} aria-label={c.status.replace("_", " ")} />
              <span>
                {c.requirement}
                {c.evidence && <span className="block text-xs italic text-muted">Your resume: “{c.evidence}”</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function JobCard({ job, countryLabel, onTailor, onMatch }: { job: ResultJob; countryLabel?: string; onTailor: (job: ResultJob) => void; onMatch: (job: ResultJob) => void }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<ResultJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tracked, setTracked] = useState<string | null>(null);
  const c = job.compatibility;

  async function addToTracker() {
    try {
      // Saved as "Saved" — adding a job to the tracker never marks it as applied.
      const r = await api<{ entry: { id: string } }>("/api/tracker", { body: { fromJobId: job.id } });
      setTracked(r.entry.id);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  const scope = SCOPE_BADGE[job.scope];
  const d = full ?? job;

  async function toggle() {
    setOpen((o) => !o);
    if (!full && !open) {
      try {
        setFull((await api<{ job: ResultJob }>(`/api/jobs/${encodeURIComponent(job.id)}`)).job);
      } catch (e) {
        setErr(errorMessage(e));
      }
    }
  }

  const location = job.location.raw ?? (job.location.remoteScope ? `Remote · open to ${job.location.remoteScope}` : null);

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={scope.tone}>{scope.label}</Badge>
            {countryLabel && <Badge>{countryLabel}</Badge>}
            {job.visaSponsorship && <Badge tone="add">Visa sponsorship</Badge>}
          </div>
          <h3 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink">{job.title}</h3>
          <p className="text-sm text-ink-2">{job.company ?? <span className="text-muted">Company not provided</span>}</p>
        </div>
        {c && (
          <div
            className={cx(
              "w-full rounded-xl px-3 py-2 text-right sm:w-auto",
              c.allEssentialsMet ? "bg-add-bg" : c.score >= 60 ? "bg-brand-soft" : c.score >= 30 ? "bg-mod-bg" : "bg-black/[0.04]",
            )}
          >
            <p className="font-display text-xl font-semibold leading-none">{c.score}%</p>
            <p className="mt-0.5 text-xs font-medium">{c.label}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted">{c.method === "ai" ? "AI assessment" : "Keyword match"}</p>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        <Field icon={MapPin} label="Location">{location ?? NP}</Field>
        <Field icon={Laptop} label="Work arrangement">
          {job.workArrangement ? ARRANGEMENT_LABEL[job.workArrangement.value] + FROM_NOTE[job.workArrangement.from] : NP}
        </Field>
        <Field icon={Briefcase} label="Employment type">
          {job.employmentTypes ? job.employmentTypes.value.map((t) => EMPLOYMENT_LABEL[t]).join(", ") : NP}
        </Field>
        <Field icon={Wallet} label="Salary">{job.salary ? job.salary.text : NP}</Field>
        <Field icon={CalendarDays} label="Posted">{posted(job.postedAt)}</Field>
        <Field icon={Building2} label="Source">
          {job.sourceLabel}
          {job.alsoListedOn.length > 0 && <span className="text-muted"> · also on {job.alsoListedOn.map((a) => a.providerName).join(", ")}</span>}
        </Field>
        {job.experienceLevel && (
          <Field icon={Clock} label="Experience level">
            {EXPERIENCE_LABEL[job.experienceLevel.value]}
            {FROM_NOTE[job.experienceLevel.from]}
          </Field>
        )}
        {(job.languagesRequired || job.postingLanguage) && (
          <Field icon={FileText} label="Language">
            {job.languagesRequired ? `Requires ${job.languagesRequired.join(", ")}` : `Posting written in ${job.postingLanguage}`}
          </Field>
        )}
      </div>

      {job.unverifiedFilters.length > 0 && (
        <p className="mt-3 rounded-lg bg-mod-bg/70 px-3 py-1.5 text-xs text-mod-ink">
          Not stated in this posting, so it may not match your filter: {job.unverifiedFilters.map((k) => FILTER_LABEL[k]).join(", ")}.
        </p>
      )}

      {c && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted">Why it’s recommended</p>
          <ul className="space-y-0.5">
            {c.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {c.concerns && c.concerns.length > 0 && <p className="mt-1.5 text-del-ink">Gaps: {c.concerns.join(" · ")}</p>}
        </div>
      )}

      {err && !open && <p className="mt-3 text-sm text-del-ink">{err}</p>}
      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {err && <p className="text-sm text-del-ink">{err}</p>}
          {c?.essentials && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Checks title="Essential requirements" list={c.essentials} />
              <Checks title="Nice to have" list={c.niceToHave ?? []} />
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Required qualifications</p>
            {d.qualifications ? (
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
                {d.qualifications.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Not provided as a separate section{d.descriptionComplete ? " — see the description." : "."}</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Job description{!d.descriptionComplete && " (summary from the source — open the posting for the full text)"}
            </p>
            <div className="max-h-96 overflow-auto whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
              {d.description || NP}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2"
        >
          View original posting <ExternalLink className="size-3.5" />
        </a>
        <Button size="sm" onClick={() => onMatch(job)}>
          Analyze match & skills gap
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onTailor(job)}>
          Tailor my resume for this job
        </Button>
        <Button size="sm" variant="ghost" onClick={addToTracker} disabled={tracked !== null}>
          {tracked ? "In tracker ✓" : "Add to tracker"}
        </Button>
        <Button size="sm" variant="ghost" onClick={toggle} icon={<ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />}>
          {open ? "Hide details" : "Description & requirements"}
        </Button>
      </div>
    </article>
  );
}
