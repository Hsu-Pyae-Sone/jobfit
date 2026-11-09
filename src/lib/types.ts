// Shared types used by both the server (API routes) and the client (UI).

export type LineKind = "heading" | "bullet" | "text";

/** One line of a resume, produced deterministically from the user's confirmed text. */
export interface ResumeLine {
  id: string; // "L1", "L2", ... stable for a given resume text
  kind: LineKind;
  text: string; // without bullet marker
  section: string; // nearest heading above, or "Header"
}

export interface SourceInfo {
  method: "paste" | "pdf-text" | "docx" | "ocr-tesseract" | "ocr-ai" | "url" | "text-file" | "profile";
  fileName?: string;
  warnings?: string[];
}

export interface ExtraInfo {
  education: string;
  experience: string;
  projects: string;
  achievements: string;
  certifications: string;
  skills: string;
}

export interface CompanyInfo {
  name: string;
  url: string;
  notes: string;
  pageText: string; // text pulled from a job/company URL (user-confirmed)
}

export interface Inputs {
  resumeText: string;
  resumeConfirmed: boolean;
  resumeSource?: SourceInfo;
  jobText: string;
  jobConfirmed: boolean;
  jobSource?: SourceInfo;
  extra: ExtraInfo;
  company: CompanyInfo;
  targetRole: string;
  targetIndustry: string;
}

export type Importance = "required" | "preferred" | "nice_to_have";

export interface Finding {
  title: string;
  detail: string;
  requirementQuote: string;
  resumeEvidence: string;
  lineIds: string[];
  importance: Importance;
  /** Set by the server: true when the quote was found verbatim in the source. */
  requirementQuoteVerified?: boolean;
  resumeEvidenceVerified?: boolean;
}

export interface MetricQuestion {
  id: string;
  lineId: string;
  bulletText: string;
  questions: string[];
  whyItMatters: string;
}

export interface Analysis {
  overview: string;
  detectedRole: string;
  detectedIndustry: string;
  strongMatches: Finding[];
  partialMatches: Finding[];
  missingRequirements: Finding[];
  recommendedImprovements: Finding[];
  keywords: { matched: string[]; missing: string[] };
  preferredQualifications: string[];
  emphasize: { lineId: string; reason: string }[];
  weakBullets: { lineId: string; issue: string }[];
  missingInformation: string[];
  formattingIssues: string[];
  industryTerms: string[];
  metricQuestions: MetricQuestion[];
  /** Deterministic ATS / formatting checks run on the original resume. */
  autoFormatting: ReviewItem[];
  inputHash: string;
  createdAt: string;
}

export interface MetricAnswer {
  answer: string;
  noNumber: boolean;
}

export type SuggestionType = "modify" | "add" | "remove" | "move";

export interface ClaimFlags {
  unsupportedNumbers: string[];
  newTerms: string[]; // terms not found anywhere in the user's verified information
  genericPhrases: string[];
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  lineId: string; // target line (modify/remove/move) or anchor line (add: insert after)
  afterLineId: string; // move only: destination anchor
  original: string; // filled in by the server from the parsed resume
  proposed: string; // new text (modify/add); may contain "\n" for multi-line adds
  kind: LineKind; // kind of the new line(s) for add
  reason: string;
  significance: "major" | "minor";
  category: string;
  flags: ClaimFlags;
}

export type Decision = "pending" | "accepted" | "rejected";

export interface Optimization {
  suggestions: Suggestion[];
  notes: string;
  inputHash: string;
  createdAt: string;
}

export type Tone = "professional" | "confident" | "concise";

export interface CoverParagraph {
  id: string;
  text: string;
  purpose: string;
  flags?: ClaimFlags;
}

export interface CoverLetter {
  tone: Tone;
  greeting: string;
  paragraphs: CoverParagraph[];
  closing: string;
  signatureName: string;
  createdAt: string;
}

export type ReviewSeverity = "error" | "warning" | "info" | "pass";
export type ReviewCategory =
  | "accuracy"
  | "grammar"
  | "relevance"
  | "consistency"
  | "ats"
  | "claims"
  | "contact"
  | "completeness";

export interface ReviewItem {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  target: "resume" | "cover_letter";
  message: string;
  detail?: string;
  source: "automatic" | "ai";
}

export interface Review {
  items: ReviewItem[];
  contentHash: string;
  aiIncluded: boolean;
  createdAt: string;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  inputs: Inputs;
  analysis?: Analysis;
  answers: Record<string, MetricAnswer>;
  optimization?: Optimization;
  decisions: Record<string, Decision>;
  /** User edits to a suggestion's proposed text before accepting it. */
  edits: Record<string, string>;
  /** Suggestions whose new claims the user explicitly confirmed as true. */
  confirmations: Record<string, boolean>;
  /** Manually edited final resume; null means "compose from accepted suggestions". */
  finalResume: string | null;
  coverLetter?: CoverLetter;
  review?: Review;
}

export interface WorkspaceSummary {
  id: string;
  title: string;
  updatedAt: string;
  stage: string;
}

export type LibraryKind = "resume" | "cover_letter";

/** "template": reusable (max 3 per kind). "application": generated for one application. */
export type LibraryCategory = "template" | "application";

export const TEMPLATE_LIMIT = 3;

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  category: LibraryCategory;
  title: string;
  workspaceId: string | null;
  trackerId: string | null;
  content: string; // plain text: resume text, or full cover letter text
  createdAt: string;
  updatedAt: string;
}

export const emptyInputs = (): Inputs => ({
  resumeText: "",
  resumeConfirmed: false,
  jobText: "",
  jobConfirmed: false,
  extra: { education: "", experience: "", projects: "", achievements: "", certifications: "", skills: "" },
  company: { name: "", url: "", notes: "", pageText: "" },
  targetRole: "",
  targetIndustry: "",
});

/** Master career profile: the user's verified resume and details, reused across applications. */
export interface UserProfile {
  email: string;
  displayName: string;
  masterResume: string;
  masterResumeConfirmed: boolean;
  masterExtra: ExtraInfo;
  aiConsentAt: string | null;
  updatedAt: string;
}

export interface UploadMeta {
  id: string;
  fileName: string;
  mime: string;
  size: number;
  purpose: string;
  createdAt: string;
}

export const emptyExtra = (): ExtraInfo => ({ education: "", experience: "", projects: "", achievements: "", certifications: "", skills: "" });
