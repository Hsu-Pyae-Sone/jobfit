import "server-only";
import { randomUUID } from "node:crypto";
import type { ResultJob } from "../../jobs/types";
import { computeScore, normalizeWeights } from "../../match/score";
import { DEFAULT_WEIGHTS, type EvidenceItem, type MatchAnalysis, type MatchJob, type MatchSummary, type Weights } from "../../match/types";
import type { TrackerEntry } from "../../tracker/types";
import { createEntry } from "../tracker/store";
import type { ExtraInfo } from "../../types";
import { createWorkspace, docGet, docList, docPut, getStoredJob, getWorkspace, kvGet, kvSet, saveWorkspace } from "../db";
import { HttpError } from "../http";
import { getProfile } from "../jobs/profiles";
import { assessRequirements, extractRequirements, recommendGaps } from "./analyze";

export async function getWeights(): Promise<Weights> {
  return normalizeWeights({ ...DEFAULT_WEIGHTS, ...((await kvGet<Weights>("match:weights")) ?? {}) });
}

export async function setWeights(w: Partial<Weights>): Promise<Weights> {
  const next = normalizeWeights({ ...(await getWeights()), ...w });
  if (Object.values(next).every((v) => v === 0)) throw new HttpError(400, "At least one weight must be above zero.");
  await kvSet("match:weights", next);
  return next;
}

export function currentScore(m: MatchAnalysis, weights: Weights): number | null {
  return m.state === "analyzed" ? computeScore(m.requirements, weights).score : null;
}

export async function listMatches(): Promise<MatchSummary[]> {
  const weights = await getWeights();
  return (await docList<MatchAnalysis>("matches")).map((m) => ({
    id: m.id,
    title: m.job.title,
    company: m.job.company,
    profileLabel: m.profileLabel,
    score: currentScore(m, weights),
    updatedAt: m.updatedAt,
  }));
}

export async function requireMatch(id: string): Promise<MatchAnalysis> {
  const m = await docGet<MatchAnalysis>("matches", id);
  if (!m) throw new HttpError(404, "Match analysis not found.");
  return m;
}

export function saveMatch(m: MatchAnalysis): Promise<MatchAnalysis> {
  return docPut("matches", m);
}

export type MatchSource = { kind: "search"; jobId: string } | { kind: "workspace"; workspaceId: string } | { kind: "pasted"; title: string; company?: string; text: string };

async function jobFromSource(src: MatchSource): Promise<MatchJob> {
  if (src.kind === "search") {
    const j = await getStoredJob<ResultJob>(src.jobId);
    if (!j) throw new HttpError(404, "That job is no longer available. Run the search again.");
    return {
      title: j.title,
      company: j.company,
      location: j.location.raw ?? (j.location.remoteScope ? `Remote (${j.location.remoteScope})` : null),
      url: j.url,
      description: j.description,
      descriptionComplete: j.descriptionComplete,
      source: { kind: "search", jobId: j.id },
    };
  }
  if (src.kind === "workspace") {
    const ws = await getWorkspace(src.workspaceId);
    if (!ws?.inputs.jobText.trim()) throw new HttpError(400, "That application has no job description.");
    if (!ws.inputs.jobConfirmed) throw new HttpError(400, "Confirm the job description in that Studio application first.");
    return {
      title: ws.inputs.targetRole || ws.title,
      company: ws.inputs.company.name || null,
      location: null,
      url: ws.inputs.company.url || null,
      description: ws.inputs.jobText,
      descriptionComplete: true,
      source: { kind: "workspace", workspaceId: ws.id },
    };
  }
  if (!src.text.trim()) throw new HttpError(400, "Paste the job description.");
  return { title: src.title.trim() || "Untitled job", company: src.company?.trim() || null, location: null, url: null, description: src.text.trim(), descriptionComplete: true, source: { kind: "pasted" } };
}

export async function createMatch(src: MatchSource, profileId: string): Promise<MatchAnalysis> {
  const profile = await getProfile(profileId);
  if (!profile) throw new HttpError(400, "Choose a confirmed resume to compare against.");
  const now = new Date().toISOString();
  const m: MatchAnalysis = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    job: await jobFromSource(src),
    profileId,
    profileLabel: profile.label,
    resumeText: profile.resumeText,
    extra: profile.extra,
    requirements: [],
    requirementsNote: "",
    evidence: [],
    gaps: [],
    gapProgress: {},
    history: [],
    state: "new",
    pendingEvidence: false,
    workspaceId: null,
    trackerId: null,
  };
  return saveMatch(m);
}

/** Full analysis (requirements + assessment + gaps), or re-assessment with new evidence. */
export async function runMatch(m: MatchAnalysis, mode: "full" | "reassess", reason?: string): Promise<MatchAnalysis> {
  const weights = await getWeights();
  if (mode === "full" || !m.requirements.length) {
    const { requirements, note } = await extractRequirements(m.job.description, m.job.title);
    if (!requirements.length) throw new HttpError(422, note || "No requirements could be found in this job description. Paste the full posting.");
    m.requirements = requirements;
    m.requirementsNote = note;
    m.gaps = [];
  }
  m.requirements = await assessRequirements(m);
  m.state = "analyzed";
  m.pendingEvidence = false;

  // Keep recommendations for requirements that are still gaps; add ones for new gaps.
  const stillGaps = new Set(m.requirements.filter((r) => r.status === "partial" || r.status === "not_demonstrated").map((r) => r.id));
  m.gaps = m.gaps.filter((g) => stillGaps.has(g.requirementId));
  const fresh = await recommendGaps(m, weights, m.gaps.map((g) => g.requirementId));
  m.gaps = [...m.gaps, ...fresh];

  m.history.push({
    at: new Date().toISOString(),
    score: computeScore(m.requirements, weights).score,
    reason: reason ?? (mode === "full" ? "Initial analysis" : "Re-assessed"),
  });
  return saveMatch(m);
}

export function addEvidence(m: MatchAnalysis, e: Omit<EvidenceItem, "id" | "addedAt">): Promise<MatchAnalysis> {
  const n = m.evidence.reduce((max, x) => Math.max(max, Number(x.id.slice(1)) || 0), 0) + 1;
  m.evidence.push({ ...e, id: `E${n}`, addedAt: new Date().toISOString() });
  m.pendingEvidence = true;
  return saveMatch(m);
}

export async function refreshResume(m: MatchAnalysis): Promise<MatchAnalysis> {
  const profile = await getProfile(m.profileId);
  if (!profile) throw new HttpError(404, "The resume used for this analysis no longer exists.");
  m.resumeText = profile.resumeText;
  m.extra = profile.extra;
  m.pendingEvidence = true;
  return saveMatch(m);
}

const EVIDENCE_FIELD: Record<EvidenceItem["type"], keyof ExtraInfo> = {
  project: "projects",
  certification: "certifications",
  experience: "experience",
  course: "education",
  other: "achievements",
};

/** Create the Studio application for "Prepare Application" with the job and resume loaded. */
export async function prepareWorkspace(m: MatchAnalysis): Promise<string> {
  if (m.workspaceId && (await getWorkspace(m.workspaceId))) return m.workspaceId;
  if (!m.job.descriptionComplete) throw new HttpError(400, "Only a summary of this job is available. Paste the full job description first.");
  const ws = await createWorkspace(`${m.job.title}${m.job.company ? ` — ${m.job.company}` : ""}`.slice(0, 200));
  ws.inputs.jobText = [m.job.title, m.job.company && `Company: ${m.job.company}`, m.job.location && `Location: ${m.job.location}`, "", m.job.description].filter((x) => x !== null).join("\n");
  // The text comes from the job listing/pasted text the user analysed (no OCR), so it's
  // loaded as confirmed; the warning reminds them to compare it with the original.
  ws.inputs.jobConfirmed = true;
  ws.inputs.jobSource = { method: m.job.url ? "url" : "paste", fileName: m.job.url ?? undefined, warnings: ["Loaded from Job Match. Compare with the original posting if anything looks incomplete."] };
  ws.inputs.resumeText = m.resumeText;
  ws.inputs.resumeConfirmed = true;
  ws.inputs.resumeSource = { method: "paste", fileName: m.profileLabel };
  for (const [k, v] of Object.entries(m.extra)) (ws.inputs.extra as unknown as Record<string, string>)[k] = v;
  // Evidence the user added becomes additional (user-provided) information.
  for (const e of m.evidence) {
    const field = EVIDENCE_FIELD[e.type];
    const line = `${e.title}${e.date ? ` (${e.date})` : ""}: ${e.description}${e.link ? ` — ${e.link}` : ""}`;
    ws.inputs.extra[field] = [ws.inputs.extra[field], line].filter(Boolean).join("\n");
  }
  ws.inputs.company = { ...ws.inputs.company, name: m.job.company ?? "", url: m.job.url ?? "" };
  ws.inputs.targetRole = m.job.title;
  await saveWorkspace(ws);
  m.workspaceId = ws.id;
  await saveMatch(m);
  return ws.id;
}

// ---------- Tracker ----------

export async function addToTracker(m: MatchAnalysis): Promise<TrackerEntry> {
  if (m.trackerId) {
    const existing = await docGet<TrackerEntry>("tracker", m.trackerId);
    if (existing) return existing;
  }
  const ws = m.workspaceId ? await getWorkspace(m.workspaceId) : null;
  const studio = ws ? { ref: `workspace:${ws.id}`, label: `Studio: ${ws.title}` } : null;
  // Status is "Preparing" (documents drafted) or "Saved" — never "Applied" on its own.
  const entry = await createEntry({
    company: m.job.company ?? "",
    title: m.job.title,
    location: m.job.location ?? "",
    url: m.job.url ?? "",
    status: ws ? "preparing" : "saved",
    matchScore: currentScore(m, await getWeights()),
    matchId: m.id,
    workspaceId: ws?.id ?? null,
    resumeVersion: studio,
    coverLetterVersion: ws?.coverLetter ? studio : null,
    source: "match",
  });
  m.trackerId = entry.id;
  await saveMatch(m);
  return entry;
}
