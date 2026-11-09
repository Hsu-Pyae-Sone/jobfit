// AI Job Match & Skills Gap Analysis — shared types (client + server).

export type ReqCategory = "required_skill" | "experience" | "education" | "preferred_skill" | "other";
export type ReqStatus = "verified" | "partial" | "not_demonstrated" | "unknown";

export const CATEGORY_LABEL: Record<ReqCategory, string> = {
  required_skill: "Required skills",
  experience: "Relevant experience",
  education: "Education & certifications",
  preferred_skill: "Preferred skills",
  other: "Other stated requirements",
};
export const CATEGORY_ORDER: ReqCategory[] = ["required_skill", "experience", "education", "preferred_skill", "other"];

export const STATUS_LABEL: Record<ReqStatus, string> = {
  verified: "Verified Match",
  partial: "Partial Match",
  not_demonstrated: "Not Demonstrated",
  unknown: "Unknown",
};

export type Weights = Record<ReqCategory, number>;
export const DEFAULT_WEIGHTS: Weights = { required_skill: 35, experience: 25, education: 15, preferred_skill: 15, other: 10 };

export interface Requirement {
  id: string; // R1, R2, ...
  category: ReqCategory;
  text: string; // short label
  quote: string; // verbatim from the posting
  quoteVerified: boolean;
  status: ReqStatus;
  evidence: string; // exact quote from resume or evidence
  evidenceSource: string; // "resume" or an evidence id
  evidenceVerified: boolean;
  explanation: string;
}

export type EvidenceType = "project" | "certification" | "experience" | "course" | "other";

export interface EvidenceItem {
  id: string; // E1, E2, ...
  type: EvidenceType;
  title: string;
  description: string;
  link: string;
  date: string;
  requirementIds: string[];
  addedAt: string;
}

export interface LearningResource {
  name: string;
  provider: string;
  type: "course" | "documentation" | "book" | "tutorial" | "certification" | "community" | "practice";
  free: boolean;
}

export interface GapRecommendation {
  requirementId: string;
  skillName: string;
  whyItMatters: string;
  resources: LearningResource[];
  project: string;
  estimatedTime: string; // "" when not reasonable to estimate
  demonstrate: string;
}

export type GapProgress = "not_started" | "in_progress" | "completed";

export interface ScoreSnapshot {
  at: string;
  score: number | null;
  reason: string;
}

export interface MatchJob {
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string;
  descriptionComplete: boolean;
  source: { kind: "search"; jobId: string } | { kind: "workspace"; workspaceId: string } | { kind: "pasted" };
}

export interface MatchAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  job: MatchJob;
  profileId: string;
  profileLabel: string;
  resumeText: string; // snapshot used for assessment
  extra: Record<string, string>;
  requirements: Requirement[];
  requirementsNote: string;
  evidence: EvidenceItem[];
  gaps: GapRecommendation[];
  gapProgress: Record<string, GapProgress>;
  history: ScoreSnapshot[];
  state: "new" | "analyzed";
  /** Evidence added since the last assessment, so the verified score is out of date. */
  pendingEvidence: boolean;
  workspaceId: string | null; // Studio application from "Prepare Application"
  trackerId: string | null;
}

export interface MatchSummary {
  id: string;
  title: string;
  company: string | null;
  profileLabel: string;
  score: number | null;
  updatedAt: string;
}
