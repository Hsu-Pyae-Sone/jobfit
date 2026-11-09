// Prioritized next actions for the dashboard. Every action is derived from a specific
// record (an interview date, a skills gap seen in N analysed jobs, an application with no
// response) and states that evidence, so it's actionable and never generic advice.

export type ActionKind = "setup" | "interview" | "deadline" | "follow_up" | "evidence" | "recalculate" | "project" | "resume" | "explore_job" | "search";

export interface NextAction {
  kind: ActionKind;
  priority: "high" | "medium" | "low";
  score: number; // for ordering
  title: string;
  evidence: string; // why this is suggested
  href: string;
  cta: string;
}

export interface ActionInput {
  today: string; // YYYY-MM-DD
  hasProfile: boolean;
  profileWorkspaceId: string | null;
  interviews: { trackerId: string; company: string; title: string; stage: string; date: string; matchId: string | null }[];
  deadlines: { trackerId: string; company: string; title: string; date: string; workspaceId: string | null }[];
  followUps: { trackerId: string; company: string; title: string; date: string }[];
  staleApplications: { trackerId: string; company: string; title: string; appliedOn: string }[];
  completedWithoutEvidence: { matchId: string; skill: string; jobTitle: string }[];
  pendingRecalculation: { matchId: string; jobTitle: string }[];
  frequentGaps: { skill: string; count: number; total: number; project: string | null; matchId: string; progress: "not_started" | "in_progress" | "completed" }[];
  resumeIssue: { message: string; detail?: string } | null;
  newJobs: { jobId: string; title: string; company: string | null; score: number; postedAt: string }[];
  hasSearched: boolean;
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const when = (n: number) => (n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
const name = (title: string, company: string | null) => [title, company].filter(Boolean).join(" at ") || "an application";
const level = (score: number): NextAction["priority"] => (score >= 70 ? "high" : score >= 40 ? "medium" : "low");

export function buildActions(i: ActionInput, max = 8): NextAction[] {
  const out: Omit<NextAction, "priority">[] = [];

  if (!i.hasProfile)
    out.push({ kind: "setup", score: 95, title: "Confirm your resume in Resume Studio", evidence: "No confirmed resume yet, so jobs can’t be matched or ranked for you.", href: "/studio", cta: "Open Resume Studio" });

  for (const iv of i.interviews) {
    const d = days(i.today, iv.date.slice(0, 10));
    if (d < 0 || d > 7) continue;
    out.push({
      kind: "interview",
      score: 100 - d * 6,
      title: `Prepare for your ${iv.stage || "interview"} for ${name(iv.title, iv.company)}`,
      evidence: `Interview ${when(d)}${iv.date.length > 10 ? ` at ${iv.date.slice(11, 16)}` : ""}.${iv.matchId ? " Review the requirements you haven’t demonstrated yet." : ""}`,
      href: iv.matchId ? `/match/${iv.matchId}` : `/tracker`,
      cta: iv.matchId ? "Review match & gaps" : "Open in tracker",
    });
  }

  for (const dl of i.deadlines) {
    const d = days(i.today, dl.date);
    if (d < -1 || d > 7) continue;
    out.push({
      kind: "deadline",
      score: 92 - d * 6,
      title: `Apply to ${name(dl.title, dl.company)}`,
      evidence: `Application deadline ${when(d)} and it isn’t marked as applied.`,
      href: dl.workspaceId ? `/studio/${dl.workspaceId}` : "/tracker",
      cta: dl.workspaceId ? "Finish documents" : "Open in tracker",
    });
  }

  for (const f of i.followUps) {
    const d = days(i.today, f.date);
    if (d > 3) continue;
    out.push({ kind: "follow_up", score: d <= 0 ? 80 : 58, title: `Follow up on ${name(f.title, f.company)}`, evidence: `Follow-up date ${when(d)}.`, href: "/tracker", cta: "Open in tracker" });
  }

  for (const s of i.staleApplications) {
    const d = days(s.appliedOn, i.today);
    if (d < 10) continue;
    out.push({ kind: "follow_up", score: 55, title: `Follow up on ${name(s.title, s.company)}`, evidence: `Applied ${d} days ago with no response recorded and no follow-up scheduled.`, href: "/tracker", cta: "Open in tracker" });
  }

  for (const c of i.completedWithoutEvidence)
    out.push({ kind: "evidence", score: 50, title: `Add evidence for ${c.skill}`, evidence: `You marked it completed for “${c.jobTitle}”, but your score only changes once evidence is added.`, href: `/match/${c.matchId}`, cta: "Add evidence" });

  for (const p of i.pendingRecalculation)
    out.push({ kind: "recalculate", score: 45, title: `Recalculate your match for ${p.jobTitle}`, evidence: "You added evidence or updated your resume since the last calculation.", href: `/match/${p.matchId}`, cta: "Recalculate" });

  for (const g of i.frequentGaps) {
    if (g.count < 2 || g.progress === "completed") continue;
    out.push({
      kind: "project",
      score: 40 + Math.min(20, g.count * 4) - (g.progress === "in_progress" ? 5 : 0),
      title: g.project ? `Build a portfolio project in ${g.skill}` : `Develop ${g.skill}`,
      evidence: `Not demonstrated in ${g.count} of ${g.total} jobs you analysed.${g.project ? ` Suggested: ${g.project}` : ""}`,
      href: `/match/${g.matchId}`,
      cta: "See the plan",
    });
  }

  if (i.resumeIssue)
    out.push({
      kind: "resume",
      score: 36,
      title: `Improve your resume: ${i.resumeIssue.message.replace(/\.$/, "")}`,
      evidence: i.resumeIssue.detail ?? "Found by the automatic resume check.",
      href: i.profileWorkspaceId ? `/studio/${i.profileWorkspaceId}?step=inputs` : "/studio",
      cta: "Edit resume",
    });

  for (const j of i.newJobs.slice(0, 2))
    out.push({ kind: "explore_job", score: 30 + Math.round(j.score / 10), title: `Explore a new match: ${name(j.title, j.company)}`, evidence: `Posted ${days(j.postedAt.slice(0, 10), i.today) <= 0 ? "today" : `${days(j.postedAt.slice(0, 10), i.today)} day(s) ago`}; ${j.score}% keyword overlap with your resume.`, href: "/search", cta: "Open Job Explorer" });

  if (!i.hasSearched && i.hasProfile)
    out.push({ kind: "search", score: 20, title: "Search for roles in your location", evidence: "No recent searches, so there are no job recommendations yet.", href: "/search", cta: "Open Job Explorer" });

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((a) => ({ ...a, priority: level(a.score) }));
}
