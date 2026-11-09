import { containsTerm } from "../claims";
import { isSectionHeading, parseResume } from "../resume/parse";
import type { Compatibility, Job } from "./types";

// Keyword compatibility: a fast, free first pass that needs no AI. It compares terms from
// the user's verified resume with the job text. It never labels a job a "perfect match" -
// only the AI requirement-by-requirement assessment can establish that.

const STOP = new Set(
  "and or the a an of for with in on at to by from as is are be our your we you will team work working role job experience years year skills skill ability strong good excellent knowledge using use etc including".split(" "),
);

/** Skills and tools from the resume: items in skills-like sections plus tool-like tokens anywhere. */
export function profileTerms(resume: string): string[] {
  const terms = new Map<string, string>();
  const add = (t: string) => {
    const clean = t.replace(/^[-•*\s]+|[.:;,\s]+$/g, "").trim();
    if (clean.length < 2 || clean.length > 40 || STOP.has(clean.toLowerCase()) || /^\d+$/.test(clean)) return;
    if (clean.split(/\s+/).length > 4) return;
    terms.set(clean.toLowerCase(), clean);
  };
  for (const line of parseResume(resume)) {
    if (/skill|competenc|technolog|tools|languages|certific/i.test(line.section) && line.kind !== "heading") {
      line.text.split(/[,;|•·]|\s[-–]\s|:\s/).forEach(add);
    }
  }
  const tokenRe = /[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]/g;
  for (const raw of resume.split("\n")) {
    if (isSectionHeading(raw.trim())) continue;
    for (const tok of raw.match(tokenRe) ?? []) {
      const t = tok.replace(/\.$/, "");
      if (/^[A-Z0-9]{2,6}$/.test(t) && /[A-Z]/.test(t)) add(t); // SQL, AWS, GCP
      else if (/[+#]|[a-z][A-Z]|\.[a-z]{2,}$/.test(t)) add(t); // C++, JavaScript, Node.js
    }
  }
  return [...terms.values()];
}

function jobDemandTerms(job: Job): string[] {
  const structured = [job.qualifications?.join("\n") ?? "", job.tags.join(", ")].join("\n").trim();
  const src = structured || job.description.slice(0, 4000);
  const out = new Set<string>();
  for (const tok of src.match(/[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]/g) ?? []) {
    const t = tok.replace(/\.$/, "");
    if ((/^[A-Z0-9]{2,6}$/.test(t) && /[A-Z]/.test(t) && !/^(OR|AND|THE|WE|YOU|IT|CV|HR|EU|UK|US|USA|GMBH|AG|OY|M|W|D)$/.test(t)) || /[+#]|[a-z][A-Z]/.test(t)) out.add(t);
  }
  for (const tag of job.tags) if (tag.length <= 30) out.add(tag);
  return [...out];
}

const MIN_EVIDENCE = 6;

/** Lines naming roles the user has held: non-bullet experience lines and the resume headline. */
export function roleLines(resume: string): string {
  return parseResume(resume)
    .filter((l) => l.kind === "text" && (/experience|employment|work|career/i.test(l.section) || l.section === "Header"))
    .map((l) => l.text)
    .join("\n");
}

export function keywordCompatibility(job: Job, resume: string, terms = profileTerms(resume)): Compatibility {
  const jobText = [job.title, job.tags.join(" "), job.qualifications?.join("\n") ?? "", job.description].join("\n");
  const matched = terms.filter((t) => containsTerm(jobText, t));
  const demand = jobDemandTerms(job);
  const missing = demand.filter((d) => !containsTerm(resume, d)).slice(0, 8);

  // Title overlap: job-title words found in the titles the user has actually held (role
  // lines like "Junior Data Analyst, Brightline Retail — 2024"), not anywhere in the resume.
  const roles = roleLines(resume);
  const titleWords = job.title
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const titleHits = titleWords.filter((w) => containsTerm(roles, w));
  const titleScore = titleWords.length ? titleHits.length / titleWords.length : 0;

  // A single matching term is weak evidence: coverage needs at least MIN_EVIDENCE terms
  // to reach 100%, so a posting that names few skills can't look like a perfect fit.
  const coverage = matched.length / Math.max(matched.length + missing.length, MIN_EVIDENCE);
  // Keyword overlap can't establish that requirements are met, so it never reaches 100%;
  // with only a short summary of the posting there's even less to go on.
  const cap = job.descriptionComplete ? 85 : 60;
  const score = Math.min(cap, Math.round(Math.min(1, coverage * 0.7 + titleScore * 0.3) * 100));

  const reasons: string[] = [];
  if (!job.descriptionComplete) reasons.push("Only a short summary of this posting is available, so this estimate is rough.");
  if (matched.length) reasons.push(`Mentions ${matched.slice(0, 6).join(", ")} from your resume.`);
  if (titleHits.length) reasons.push(`Job title overlaps with your experience (${titleHits.join(", ")}).`);
  if (missing.length) reasons.push(`Not found in your resume: ${missing.slice(0, 5).join(", ")}.`);
  if (!matched.length && !titleHits.length) reasons.push("Few terms from your resume appear in this posting.");

  const label = score >= 70 ? "Strong keyword overlap" : score >= 45 ? "Good keyword overlap" : score >= 20 ? "Some overlap" : "Low overlap";
  return { score, label, reasons, matchedTerms: matched, method: "keywords" };
}
