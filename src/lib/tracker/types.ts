// Job Application Tracker — shared types (client + server).

/**
 * Every status (including custom ones) belongs to a group. Statistics use the group, so
 * renaming or adding statuses never breaks them.
 */
export type StatusGroup = "not_applied" | "applied" | "in_process" | "interview" | "offer" | "rejected" | "withdrawn";

export const GROUP_LABEL: Record<StatusGroup, string> = {
  not_applied: "Not applied yet",
  applied: "Applied — awaiting response",
  in_process: "In process (responded)",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export interface StatusDef {
  id: string;
  label: string;
  group: StatusGroup;
  color: StatusColor;
}

export type StatusColor = "slate" | "blue" | "teal" | "violet" | "amber" | "green" | "red" | "gray";

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "saved", label: "Saved", group: "not_applied", color: "slate" },
  { id: "preparing", label: "Preparing", group: "not_applied", color: "gray" },
  { id: "applied", label: "Applied", group: "applied", color: "blue" },
  { id: "screening", label: "Screening", group: "in_process", color: "teal" },
  { id: "interview", label: "Interview", group: "interview", color: "violet" },
  { id: "assessment", label: "Assessment", group: "in_process", color: "amber" },
  { id: "offer_received", label: "Offer Received", group: "offer", color: "green" },
  { id: "accepted", label: "Accepted", group: "offer", color: "green" },
  { id: "rejected", label: "Rejected", group: "rejected", color: "red" },
  { id: "withdrawn", label: "Withdrawn", group: "withdrawn", color: "gray" },
];

export type EmploymentTypeValue = "" | "full_time" | "part_time" | "contract" | "internship" | "temporary";
export type ArrangementValue = "" | "remote" | "hybrid" | "onsite";

export interface DocRef {
  /** "library:<id>", "workspace:<id>", or "" for a free-text label */
  ref: string;
  label: string;
}

export interface InterviewNote {
  id: string;
  date: string; // YYYY-MM-DD
  stage: string;
  text: string;
  createdAt: string;
}

export interface StatusChange {
  status: string;
  group: StatusGroup;
  at: string; // ISO
}

export interface TrackerEntry {
  id: string;
  company: string;
  title: string;
  location: string;
  employmentType: EmploymentTypeValue;
  workArrangement: ArrangementValue;
  salary: string;
  url: string;
  applicationDate: string; // YYYY-MM-DD or ""
  deadline: string; // YYYY-MM-DD or ""
  status: string; // StatusDef.id
  matchScore: number | null;
  matchId: string | null;
  resumeVersion: DocRef | null;
  coverLetterVersion: DocRef | null;
  recruiterContact: string;
  interviewDate: string; // YYYY-MM-DDTHH:mm or ""
  interviewStage: string;
  followUpDate: string; // YYYY-MM-DD or ""
  notes: string;
  feedback: InterviewNote[];
  history: StatusChange[];
  workspaceId: string | null;
  source: "manual" | "search" | "match";
  createdAt: string;
  updatedAt: string; // "Last updated"
}

/** Fields editable from the spreadsheet / detail panel. */
export const EDITABLE_FIELDS = [
  "company",
  "title",
  "location",
  "employmentType",
  "workArrangement",
  "salary",
  "url",
  "applicationDate",
  "deadline",
  "status",
  "resumeVersion",
  "coverLetterVersion",
  "recruiterContact",
  "interviewDate",
  "interviewStage",
  "followUpDate",
  "notes",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const EMPLOYMENT_OPTIONS: Record<Exclude<EmploymentTypeValue, "">, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};
export const ARRANGEMENT_OPTIONS: Record<Exclude<ArrangementValue, "">, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export const INTERVIEW_STAGES = ["Recruiter screen", "Phone interview", "Technical interview", "Case / take-home", "On-site / panel", "Final interview", "HR / offer call"];

export interface VersionOption {
  ref: string;
  label: string;
  kind: "resume" | "cover_letter" | "both";
}
