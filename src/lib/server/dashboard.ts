import "server-only";
import { buildActions, type NextAction } from "../dashboard/actions";
import { dedupeKey } from "../jobs/extract";
import { keywordCompatibility, profileTerms } from "../jobs/match";
import type { ResultJob } from "../jobs/types";
import { computeScore } from "../match/score";
import type { MatchAnalysis } from "../match/types";
import { atsChecks } from "../review";
import { computeStats, groupOf, todayIso, type TrackerStats } from "../tracker/logic";
import type { TrackerEntry } from "../tracker/types";
import { docList, kvGet, kvSet, recentJobs } from "./db";
import { getProfile, listProfiles, type Profile } from "./jobs/profiles";
import { getWeights } from "./match/store";
import { getStatuses, listEntries } from "./tracker/store";

export interface Settings {
  primaryProfileId: string | null;
}

export async function getSettings(): Promise<Settings> {
  return { primaryProfileId: null, ...((await kvGet<Settings>("settings")) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await kvSet("settings", next);
  return next;
}

/** The resume used across the dashboard: the chosen one, else the master profile, else the most recent confirmed one. */
export async function primaryProfile(): Promise<Profile | null> {
  const s = await getSettings();
  return (await getProfile(s.primaryProfileId)) ?? (await getProfile((await listProfiles())[0]?.id));
}

const normSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

export interface Dashboard {
  profile: { id: string; label: string } | null;
  stats: TrackerStats;
  interviews: { trackerId: string; title: string; company: string; stage: string; date: string }[];
  deadlines: { trackerId: string; title: string; company: string; date: string; overdue: boolean }[];
  recommendedJobs: { id: string; title: string; company: string | null; location: string; url: string; score: number; label: string; reasons: string[]; postedAt: string | null; source: string }[];
  strongestRoles: { matchId: string; title: string; company: string | null; score: number }[];
  missingSkills: { skill: string; count: number; total: number; progress: Record<string, number>; matchId: string }[];
  skillProgress: { notStarted: number; inProgress: number; completedNoEvidence: number; evidenceAdded: number; verifiedSinceStart: number; total: number };
  actions: NextAction[];
  analysedJobs: number;
  lastSearchAt: string | null;
}

export async function buildDashboard(): Promise<Dashboard> {
  const today = todayIso();
  const profile = await primaryProfile();
  const statuses = await getStatuses();
  const entries: TrackerEntry[] = await listEntries();
  const stats = computeStats(entries, statuses);
  const active = (e: TrackerEntry) => !["rejected", "withdrawn"].includes(groupOf(e.status, statuses));
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const interviews = entries
    .filter((e) => active(e) && e.interviewDate && e.interviewDate.slice(0, 10) >= today && e.interviewDate.slice(0, 10) <= in14)
    .sort((a, b) => a.interviewDate.localeCompare(b.interviewDate))
    .map((e) => ({ trackerId: e.id, title: e.title, company: e.company, stage: e.interviewStage, date: e.interviewDate, matchId: e.matchId }));

  const deadlines = entries
    .filter((e) => groupOf(e.status, statuses) === "not_applied" && e.deadline && e.deadline <= in14 && e.deadline >= new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10))
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .map((e) => ({ trackerId: e.id, title: e.title, company: e.company, date: e.deadline, overdue: e.deadline < today, workspaceId: e.workspaceId }));

  // ---- Match analyses
  const weights = await getWeights();
  const matches = (await docList<MatchAnalysis>("matches")).filter((m) => m.state === "analyzed");
  const strongestRoles = matches
    .map((m) => ({ matchId: m.id, title: m.job.title, company: m.job.company, score: computeScore(m.requirements, weights).score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const skillMap = new Map<string, { skill: string; matchIds: Set<string>; progress: Record<string, number>; project: string | null; firstMatch: string }>();
  let notStarted = 0,
    inProgress = 0,
    completedNoEvidence = 0,
    evidenceAdded = 0,
    verifiedSinceStart = 0;
  const completedWithoutEvidence: { matchId: string; skill: string; jobTitle: string }[] = [];
  for (const m of matches) {
    for (const r of m.requirements) {
      const isSkill = r.category === "required_skill" || r.category === "preferred_skill" || r.category === "education";
      const evidenced = m.evidence.some((e) => e.requirementIds.includes(r.id));
      if (r.status === "verified" && evidenced) verifiedSinceStart++;
      if (!isSkill || (r.status !== "not_demonstrated" && r.status !== "partial")) continue;
      const rec = m.gaps.find((g) => g.requirementId === r.id);
      const name = rec?.skillName ?? r.text;
      const key = normSkill(name);
      const progress = m.gapProgress[r.id] ?? "not_started";
      const entry = skillMap.get(key) ?? { skill: name, matchIds: new Set<string>(), progress: {}, project: null, firstMatch: m.id };
      entry.matchIds.add(m.id);
      entry.progress[progress] = (entry.progress[progress] ?? 0) + 1;
      entry.project ??= rec?.project ?? null;
      skillMap.set(key, entry);
      if (evidenced) evidenceAdded++;
      else if (progress === "completed") {
        completedNoEvidence++;
        completedWithoutEvidence.push({ matchId: m.id, skill: name, jobTitle: m.job.title });
      } else if (progress === "in_progress") inProgress++;
      else notStarted++;
    }
  }
  const missingSkills = [...skillMap.values()]
    .sort((a, b) => b.matchIds.size - a.matchIds.size)
    .slice(0, 8)
    .map((s) => ({ skill: s.skill, count: s.matchIds.size, total: matches.length, progress: s.progress, matchId: s.firstMatch, project: s.project }));

  // ---- Recommended jobs: recent search results ranked against the primary resume
  const rows = await recentJobs<ResultJob>(Date.now() - 7 * 86400000);
  const trackedUrls = new Set(entries.map((e) => e.url).filter(Boolean));
  const terms = profile ? profileTerms(profile.text) : [];
  const recommended = profile
    ? rows
        .map((r) => r.job)
        .filter((j) => !trackedUrls.has(j.url))
        .map((j) => ({ j, c: keywordCompatibility(j, profile.text, terms) }))
        .filter(({ c }) => c.score >= 25)
        .sort((a, b) => b.c.score - a.c.score)
    : [];
  const seen = new Set<string>();
  const recommendedJobs = recommended
    // The same posting can be stored by several searches/sources: de-duplicate like Job Explorer.
    .filter(({ j }) => {
      const key = dedupeKey(j.title, j.company, j.location.city ?? j.location.remoteScope);
      if (seen.has(key) || seen.has(j.url)) return false;
      seen.add(key);
      seen.add(j.url);
      return true;
    })
    .slice(0, 6)
    .map(({ j, c }) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location.raw ?? (j.location.remoteScope ? `Remote (${j.location.remoteScope})` : "Not provided"),
      url: j.url,
      score: c.score,
      label: c.label,
      reasons: c.reasons.slice(0, 2),
      postedAt: j.postedAt,
      source: j.sourceLabel,
    }));

  const issue = profile ? atsChecks(profile.resumeText).find((i) => i.severity === "warning") ?? null : null;
  const actions = buildActions({
    today,
    hasProfile: Boolean(profile),
    profileWorkspaceId: profile?.id.startsWith("ws:") ? profile.id.slice(3) : null,
    interviews,
    deadlines,
    followUps: entries.filter((e) => active(e) && e.followUpDate).map((e) => ({ trackerId: e.id, company: e.company, title: e.title, date: e.followUpDate })),
    staleApplications: entries
      .filter((e) => groupOf(e.status, statuses) === "applied" && e.applicationDate && !e.followUpDate)
      .map((e) => ({ trackerId: e.id, company: e.company, title: e.title, appliedOn: e.applicationDate })),
    completedWithoutEvidence,
    pendingRecalculation: matches.filter((m) => m.pendingEvidence).map((m) => ({ matchId: m.id, jobTitle: m.job.title })),
    frequentGaps: missingSkills.map((s) => ({
      skill: s.skill,
      count: s.count,
      total: s.total,
      project: s.project,
      matchId: s.matchId,
      progress: (s.progress.completed ? "completed" : s.progress.in_progress ? "in_progress" : "not_started") as "completed" | "in_progress" | "not_started",
    })),
    resumeIssue: issue ? { message: issue.message, detail: issue.detail } : null,
    newJobs: recommendedJobs.filter((j) => j.postedAt && Date.now() - Date.parse(j.postedAt) <= 3 * 86400000 && j.score >= 45).map((j) => ({ jobId: j.id, title: j.title, company: j.company, score: j.score, postedAt: j.postedAt! })),
    hasSearched: rows.length > 0,
  });

  return {
    profile: profile ? { id: profile.id, label: profile.label } : null,
    stats,
    interviews,
    deadlines,
    recommendedJobs,
    strongestRoles,
    missingSkills: missingSkills.map((m) => ({ skill: m.skill, count: m.count, total: m.total, progress: m.progress, matchId: m.matchId })),
    skillProgress: { notStarted, inProgress, completedNoEvidence, evidenceAdded, verifiedSinceStart, total: notStarted + inProgress + completedNoEvidence + evidenceAdded },
    actions,
    analysedJobs: matches.length,
    lastSearchAt: rows[0] ? new Date(rows[0].seenAt).toISOString() : null,
  };
}
