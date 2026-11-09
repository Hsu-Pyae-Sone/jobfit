import { checkClaims, containsTerm } from "./claims";
import { isSectionHeading, normalizeHeading, parseResume, STANDARD_SECTION_TITLES } from "./resume/parse";
import type { ReviewItem, ReviewCategory, ReviewSeverity } from "./types";

// Deterministic quality checks. They run without an API key and are the source of truth
// for contact info, ATS readability, and unsupported claims. AI review adds language checks.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /linkedin\.com\/in\//i;

const IRREGULAR_PAST = new Set(
  "built led ran wrote made drove grew won taught began brought bought chose did held kept met oversaw sold spoke took understood spent sent found gave got saw thought rebuilt rewrote undertook overcame withdrew upheld forecast".split(" "),
);

let counter = 0;
function item(
  category: ReviewCategory,
  severity: ReviewSeverity,
  target: ReviewItem["target"],
  message: string,
  detail?: string,
): ReviewItem {
  return { id: `auto-${++counter}`, category, severity, target, message, detail, source: "automatic" };
}

/** ATS / formatting checks on resume text. Used on the original (analysis) and the final (review). */
export function atsChecks(text: string): ReviewItem[] {
  const items: ReviewItem[] = [];
  const lines = parseResume(text);
  const rawLines = text.split(/\r?\n/);
  const headings = lines.filter((l) => l.kind === "heading");
  const norm = headings.map((h) => normalizeHeading(h.text));

  const has = (...names: string[]) => norm.some((h) => names.some((n) => h.includes(n)));
  if (!has("experience", "employment", "work history", "career history"))
    items.push(item("completeness", "warning", "resume", "No Experience section heading found.", "Use a standard heading such as \"Experience\" or \"Work Experience\" so ATS software can find your roles."));
  if (!has("education", "academic"))
    items.push(item("completeness", "warning", "resume", "No Education section heading found."));
  if (!has("skill", "competenc", "technolog", "tools"))
    items.push(item("completeness", "warning", "resume", "No Skills section heading found.", "A dedicated Skills section helps ATS keyword matching."));

  const nonStandard = headings.filter((h) => !STANDARD_SECTION_TITLES.has(normalizeHeading(h.text)));
  if (nonStandard.length)
    items.push(item("ats", "info", "resume", "Some section headings are non-standard.", `ATS parsers recognise standard titles more reliably: ${nonStandard.map((h) => `"${h.text}"`).join(", ")}.`));

  // "email | phone | city" in the header is a normal contact line, not a table.
  const firstHeading = rawLines.findIndex((l) => isSectionHeading(l.trim()));
  const bodyLines = firstHeading >= 0 ? rawLines.slice(firstHeading) : rawLines;
  if (bodyLines.some((l) => (l.match(/\|/g) ?? []).length >= 3 || /\t.*\t/.test(l)))
    items.push(item("ats", "warning", "resume", "Possible table or column layout detected.", "Tables and multi-column layouts are often read out of order by ATS software. The exported file uses a single column."));

  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text))
    items.push(item("ats", "warning", "resume", "Emoji or icon characters found.", "Remove icons and emoji; many ATS systems drop or garble them."));

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 150) items.push(item("completeness", "warning", "resume", `Resume is short (${words} words).`, "Consider adding detail on responsibilities, projects, and outcomes you can verify."));
  if (words > 1100) items.push(item("relevance", "info", "resume", `Resume is long (${words} words).`, "Most roles expect 1–2 pages. Prioritise the experience most relevant to this job."));

  // Date format consistency
  const formats = new Set<string>();
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{4}\b/i.test(text)) formats.add("Month YYYY");
  if (/\b\d{1,2}\/\d{4}\b/.test(text)) formats.add("MM/YYYY");
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) formats.add("MM/DD/YYYY");
  if (/\b\d{4}-\d{2}\b/.test(text)) formats.add("YYYY-MM");
  if (formats.size > 1)
    items.push(item("consistency", "warning", "resume", "Mixed date formats.", `Found: ${[...formats].join(", ")}. Use one format throughout.`));

  // Bullet punctuation consistency
  const bullets = lines.filter((l) => l.kind === "bullet");
  if (bullets.length >= 4) {
    const withPeriod = bullets.filter((b) => /\.$/.test(b.text)).length;
    if (withPeriod > 0 && withPeriod < bullets.length)
      items.push(item("consistency", "info", "resume", "Inconsistent bullet punctuation.", `${withPeriod} of ${bullets.length} bullets end with a period. Pick one style.`));
  }

  // Tense consistency inside each run of bullets
  const runs: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.kind === "bullet" && /experience|employment|work|projects/i.test(l.section)) cur.push(l.text);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  for (const run of runs) {
    const first = run.map((b) => b.split(/\s+/)[0]?.toLowerCase() ?? "");
    const past = first.filter((w) => /ed$/.test(w) || IRREGULAR_PAST.has(w)).length;
    const present = first.filter((w) => /(?:s|ing)$/.test(w) && !/ss$/.test(w)).length;
    if (past > 0 && present > 0) {
      items.push(item("consistency", "warning", "resume", "Mixed verb tenses within one role.", `Bullets starting: ${run.map((b) => `"${b.split(/\s+/).slice(0, 2).join(" ")}…"`).join(", ")}. Use present tense for a current role and past tense for previous roles.`));
      break;
    }
  }

  // Repeated opening verbs
  const counts = new Map<string, number>();
  for (const b of bullets) {
    const w = b.text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, c]) => c >= 3).map(([w, c]) => `"${w}" ×${c}`);
  if (repeated.length)
    items.push(item("grammar", "info", "resume", "Repeated opening verbs.", `${repeated.join(", ")}. Vary action verbs where it stays accurate.`));

  // Mechanical grammar
  const doubled = text.match(/\b(\w+)\s+\1\b/gi)?.filter((m) => !/^(\d+)\s+\1$/.test(m));
  if (doubled?.length) items.push(item("grammar", "warning", "resume", "Repeated words.", doubled.slice(0, 5).map((d) => `"${d}"`).join(", ")));
  const lowerStart = bullets.filter((b) => /^[a-z]/.test(b.text));
  if (lowerStart.length)
    items.push(item("grammar", "info", "resume", "Bullets starting with a lowercase letter.", lowerStart.slice(0, 3).map((b) => `"${b.text.slice(0, 50)}…"`).join(", ")));

  const pronouns = bullets.filter((b) => /^(i|my|we)\b/i.test(b.text));
  if (pronouns.length)
    items.push(item("grammar", "info", "resume", "Bullets starting with personal pronouns.", "Resume bullets usually start with an action verb, not \"I\" or \"My\"."));

  return items;
}

export function contactChecks(text: string): ReviewItem[] {
  const header = text.split(/\r?\n/).slice(0, 8).join("\n");
  const items: ReviewItem[] = [];
  if (!EMAIL_RE.test(text)) items.push(item("contact", "error", "resume", "No email address found.", "Add a professional email address to the top of the resume."));
  else if (!EMAIL_RE.test(header)) items.push(item("contact", "warning", "resume", "Email is not in the resume header.", "Put contact details at the top, outside any table or header/footer."));
  if (!PHONE_RE.test(text)) items.push(item("contact", "warning", "resume", "No phone number found."));
  if (!LINKEDIN_RE.test(text)) items.push(item("contact", "info", "resume", "No LinkedIn URL found (optional)."));
  const first = text.split(/\r?\n/).find((l) => l.trim());
  if (!first || EMAIL_RE.test(first) || first.trim().split(/\s+/).length > 6)
    items.push(item("contact", "warning", "resume", "The first line does not look like your name.", "Start the resume with your full name on its own line."));
  return items;
}

export interface ReviewInput {
  resumeText: string;
  coverLetterText: string | null;
  resumeCorpus: string;
  coverCorpus: string;
  jobKeywords: string[];
  missingKeywords: string[];
}

export function automaticReview(input: ReviewInput): ReviewItem[] {
  counter = 0;
  const items: ReviewItem[] = [...contactChecks(input.resumeText), ...atsChecks(input.resumeText)];

  const resumeFlags = checkClaims(input.resumeText, input.resumeCorpus, input.missingKeywords);
  if (resumeFlags.unsupportedNumbers.length)
    items.push(item("claims", "error", "resume", "Numbers not found in your provided information.", `${resumeFlags.unsupportedNumbers.join(", ")}. Confirm each figure or remove it before sending.`));
  if (resumeFlags.newTerms.length)
    items.push(item("claims", "warning", "resume", "Terms not found in your provided information.", `${resumeFlags.newTerms.join(", ")}. Keep these only if they are true for you.`));
  if (resumeFlags.genericPhrases.length)
    items.push(item("relevance", "warning", "resume", "Generic phrases.", `${resumeFlags.genericPhrases.map((p) => `"${p}"`).join(", ")}. Replace with specific, evidence-backed statements.`));

  if (input.jobKeywords.length) {
    const present = input.jobKeywords.filter((k) => containsTerm(input.resumeText, k));
    const pct = Math.round((present.length / input.jobKeywords.length) * 100);
    const missing = input.jobKeywords.filter((k) => !containsTerm(input.resumeText, k));
    items.push(item("relevance", pct >= 60 ? "pass" : "info", "resume", `Job keyword coverage: ${present.length}/${input.jobKeywords.length} (${pct}%).`, missing.length ? `Not present: ${missing.join(", ")}. Add only those you can honestly claim.` : undefined));
  }

  if (input.coverLetterText === null) {
    items.push(item("completeness", "info", "cover_letter", "No cover letter generated yet."));
  } else {
    const cl = input.coverLetterText;
    const f = checkClaims(cl, input.coverCorpus, input.missingKeywords);
    if (f.unsupportedNumbers.length)
      items.push(item("claims", "error", "cover_letter", "Numbers not found in your provided information.", f.unsupportedNumbers.join(", ")));
    if (f.newTerms.length)
      items.push(item("claims", "warning", "cover_letter", "Terms not found in your provided information.", f.newTerms.join(", ")));
    if (f.genericPhrases.length)
      items.push(item("relevance", "warning", "cover_letter", "Generic phrases.", f.genericPhrases.map((p) => `"${p}"`).join(", ")));
    const words = cl.split(/\s+/).filter(Boolean).length;
    if (words > 450) items.push(item("relevance", "warning", "cover_letter", `Cover letter is long (${words} words).`, "Aim for 250–400 words."));
    if (words < 120) items.push(item("completeness", "warning", "cover_letter", `Cover letter is short (${words} words).`));
    if (/\[[^\]]+\]/.test(cl)) items.push(item("completeness", "error", "cover_letter", "Unfilled placeholder in brackets.", (cl.match(/\[[^\]]+\]/g) ?? []).join(", ")));
    const dup = cl.match(/\b(\w+)\s+\1\b/gi);
    if (dup?.length) items.push(item("grammar", "warning", "cover_letter", "Repeated words.", dup.slice(0, 5).join(", ")));
  }
  if (/\[[^\]]+\]/.test(input.resumeText))
    items.push(item("completeness", "error", "resume", "Unfilled placeholder in brackets.", (input.resumeText.match(/\[[^\]]+\]/g) ?? []).join(", ")));

  // Characters the PDF's standard font cannot render.
  if (/[^\u0000-ɏ‐-‧‰-€™]/.test(input.resumeText))
    items.push(item("ats", "info", "resume", "Non-Latin or special characters found.", "PDF export uses a standard font that may not render them; check the exported PDF or use DOCX."));

  return items;
}

export function hasBlockingIssues(items: ReviewItem[]): boolean {
  return items.some((i) => i.severity === "error");
}
