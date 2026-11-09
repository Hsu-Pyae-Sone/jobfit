"use client";

import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarClock, Compass, ExternalLink, Flag, Lightbulb, Sparkles, Target, TrendingUp } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { NextAction } from "@/lib/dashboard/actions";
import type { Dashboard as Data } from "@/lib/server/dashboard";
import { Alert, Badge, Button, Card, EmptyState, cx } from "../ui";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const date = (s: string) =>
  new Date(s.length === 10 ? `${s}T00:00` : s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}) });

function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof Target; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-brand" aria-hidden />
        <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Tooltip title={hint}>
      <div className="rounded-xl border border-line bg-surface px-4 py-3" tabIndex={0} aria-label={`${label}: ${value}. ${hint}`}>
        <p className="font-display text-[28px] font-semibold leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </Tooltip>
  );
}

const PRIORITY_TONE = { high: "del", medium: "mod", low: "neutral" } as const;

function ActionRow({ a }: { a: NextAction }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority} priority</Badge>
          <p className="font-medium text-ink">{a.title}</p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted">{a.evidence}</p>
      </div>
      <Link href={a.href} className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-medium text-brand hover:underline sm:self-center">
        {a.cta} <ArrowRight className="size-4" />
      </Link>
    </li>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton variant="text" width={260} height={48} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={78} />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton variant="rounded" height={360} />
        <Skeleton variant="rounded" height={360} />
      </div>
    </div>
  );
}

export function Dashboard() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Data>("/api/dashboard")
      .then(setD)
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  if (err)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert kind="error" title="The dashboard couldn’t load">
          {err}
        </Alert>
      </div>
    );
  if (!d) return <LoadingState />;

  const s = d.stats;
  const sp = d.skillProgress;
  const hour = new Date().getHours();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Dashboard</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}</h1>
          <p className="mt-1 text-sm text-muted">
            {d.profile ? (
              <>
                Recommendations use <span className="text-ink-2">“{d.profile.label}”</span>. <Link href="/settings" className="text-brand hover:underline">Change</Link>
              </>
            ) : (
              "Confirm a resume to get personalised recommendations."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/search">
            <Button icon={<Compass className="size-4" />}>Find jobs</Button>
          </Link>
          <Link href="/studio">
            <Button variant="primary" icon={<Sparkles className="size-4" />}>
              Tailor a resume
            </Button>
          </Link>
        </div>
      </div>

      {/* Application response statistics */}
      <section aria-label="Application statistics" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Applications submitted" value={s.total} hint="Applications you’ve marked as applied (or past), or that have an application date." />
        <Stat label="Awaiting response" value={s.awaiting} hint="Applied, with no response recorded yet." />
        <Stat label="Interviews" value={s.interviews} hint="Applications that reached an interview stage." />
        <Stat label="Offers" value={s.offers} hint="Applications that reached an offer." />
        <Stat label="Response rate" value={pct(s.responseRate)} hint="Share of applications where the employer responded in any way, including rejections." />
        <Stat label="Interview conversion" value={pct(s.interviewRate)} hint="Share of applications that reached an interview." />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Panel title="Suggested next actions" icon={Lightbulb}>
            {d.actions.length ? (
              <ol className="space-y-2">
                {d.actions.map((a, i) => (
                  <ActionRow key={`${a.kind}-${i}`} a={a} />
                ))}
              </ol>
            ) : (
              <EmptyState title="You’re all caught up">Add applications to the tracker or analyse a job to get specific next steps.</EmptyState>
            )}
          </Panel>

          <Panel title="Recommended jobs" icon={Compass} action={<Link href="/search" className="text-sm font-medium text-brand hover:underline">Job Explorer</Link>}>
            {!d.profile ? (
              <EmptyState title="No resume to match against">
                Confirm your resume in <Link href="/studio" className="text-brand underline">Resume Studio</Link> first.
              </EmptyState>
            ) : d.recommendedJobs.length ? (
              <ul className="divide-y divide-line">
                {d.recommendedJobs.map((j) => (
                  <li key={j.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{j.title}</p>
                      <p className="text-sm text-ink-2">{[j.company ?? "Company not provided", j.location].join(" · ")}</p>
                      <p className="mt-1 text-xs text-muted">{j.reasons.join(" ")}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {j.source}
                        {j.postedAt ? ` · posted ${new Date(j.postedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-right">
                        <span className="block font-display text-lg font-semibold leading-none">{j.score}%</span>
                        <span className="text-[11px] text-muted">keyword match</span>
                      </span>
                      <a href={j.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-lg p-2 text-muted hover:bg-black/5 hover:text-brand" aria-label={`Open posting: ${j.title}`}>
                        <ExternalLink className="size-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No recommendations yet" action={<Link href="/search"><Button size="sm">Search jobs</Button></Link>}>
                Recommendations come from your searches in the last 7 days{d.lastSearchAt ? " and none overlapped enough with your resume" : ""}. Run a search in Job Explorer.
              </EmptyState>
            )}
            <p className="mt-2 text-[11px] text-muted">Ranked by keyword overlap with your resume. Open Match Analysis for a requirement-by-requirement check.</p>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Upcoming interviews" icon={CalendarClock}>
            {d.interviews.length ? (
              <ul className="space-y-2">
                {d.interviews.map((i) => (
                  <li key={i.trackerId} className="text-sm">
                    <p className="font-medium">{[i.title, i.company].filter(Boolean).join(" — ")}</p>
                    <p className="text-xs text-muted">
                      {i.stage || "Interview"} · {date(i.date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No interviews in the next two weeks.</p>
            )}
          </Panel>

          <Panel title="Pending deadlines" icon={Flag}>
            {d.deadlines.length ? (
              <ul className="space-y-2">
                {d.deadlines.map((x) => (
                  <li key={x.trackerId} className="text-sm">
                    <p className="font-medium">{[x.title, x.company].filter(Boolean).join(" — ")}</p>
                    <p className={cx("text-xs", x.overdue ? "text-del-ink" : "text-muted")}>{x.overdue ? "Deadline passed " : "Apply by "}{date(x.date)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No deadlines in the next two weeks for jobs you haven’t applied to.</p>
            )}
          </Panel>

          <Panel title="Strongest matching roles" icon={TrendingUp} action={<Link href="/match" className="text-sm font-medium text-brand hover:underline">All</Link>}>
            {d.strongestRoles.length ? (
              <ul className="space-y-3">
                {d.strongestRoles.map((r) => (
                  <li key={r.matchId}>
                    <Link href={`/match/${r.matchId}`} className="block hover:opacity-80">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{r.title}</span>
                        <span className="shrink-0 tabular-nums text-muted">{r.score}/100</span>
                      </div>
                      <LinearProgress variant="determinate" value={r.score} aria-label={`${r.title}: ${r.score} out of 100`} sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: "var(--line)" }} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No analysed jobs yet. Use <Link href="/match" className="text-brand underline">Match Analysis</Link> on a job you’re interested in.
              </p>
            )}
          </Panel>

          <Panel title="Frequently missing skills" icon={BriefcaseBusiness}>
            {d.missingSkills.length ? (
              <ul className="space-y-2.5">
                {d.missingSkills.map((m) => (
                  <li key={m.skill}>
                    <Link href={`/match/${m.matchId}`} className="block hover:opacity-80">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{m.skill}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {m.count} of {m.total} jobs
                        </span>
                      </div>
                      <LinearProgress variant="determinate" color="warning" value={(m.count / Math.max(1, m.total)) * 100} aria-hidden sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: "var(--line)" }} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Skills gaps appear here once you analyse jobs in Match Analysis.</p>
            )}
          </Panel>

          <Panel title="Skill development progress" icon={Target}>
            {sp.total || sp.verifiedSinceStart ? (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${sp.evidenceAdded} with evidence, ${sp.completedNoEvidence} completed without evidence, ${sp.inProgress} in progress, ${sp.notStarted} not started`}>
                  {[
                    [sp.evidenceAdded, "bg-add-ink"],
                    [sp.completedNoEvidence, "bg-[#d39b1c]"],
                    [sp.inProgress, "bg-brand/60"],
                  ].map(([n, c], i) => (
                    <div key={i} className={c as string} style={{ width: `${((n as number) / Math.max(1, sp.total)) * 100}%` }} />
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Evidence added</dt>
                  <dd className="text-right font-medium">{sp.evidenceAdded}</dd>
                  <dt className="text-muted">Completed, no evidence yet</dt>
                  <dd className="text-right font-medium">{sp.completedNoEvidence}</dd>
                  <dt className="text-muted">In progress</dt>
                  <dd className="text-right font-medium">{sp.inProgress}</dd>
                  <dt className="text-muted">Not started</dt>
                  <dd className="text-right font-medium">{sp.notStarted}</dd>
                  <dt className="text-muted">Now verified through evidence</dt>
                  <dd className="text-right font-medium text-add-ink">{sp.verifiedSinceStart}</dd>
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted">Track learning progress on skills gaps in Match Analysis. Progress is counted from the evidence you add.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
