import type { ResumeLine } from "../types";

// Deterministic resume parsing. No AI is involved, so the user's original wording is
// preserved exactly and every line gets a stable id that suggestions can refer to.

const SECTION_TITLES = [
  "summary",
  "professional summary",
  "career summary",
  "profile",
  "professional profile",
  "objective",
  "career objective",
  "about me",
  "experience",
  "work experience",
  "professional experience",
  "relevant experience",
  "employment",
  "employment history",
  "work history",
  "career history",
  "education",
  "education and training",
  "academic background",
  "skills",
  "technical skills",
  "core skills",
  "key skills",
  "core competencies",
  "competencies",
  "skills and abilities",
  "tools",
  "technologies",
  "projects",
  "selected projects",
  "personal projects",
  "academic projects",
  "certifications",
  "certificates",
  "licenses and certifications",
  "licenses",
  "achievements",
  "accomplishments",
  "awards",
  "honors",
  "honors and awards",
  "awards and honors",
  "publications",
  "research",
  "volunteer",
  "volunteering",
  "volunteer experience",
  "leadership",
  "leadership experience",
  "activities",
  "extracurricular activities",
  "languages",
  "interests",
  "references",
  "training",
  "courses",
  "relevant coursework",
  "coursework",
  "professional development",
  "affiliations",
  "memberships",
  "portfolio",
  "contact",
  "contact information",
];

export const STANDARD_SECTION_TITLES = new Set(SECTION_TITLES);

const BULLET_RE = /^\s*(?:[-*•▪●◦‣·–—►➢✓✔■□○>]|o(?=\s)|\d{1,2}[.)](?=\s))\s*/;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ /g, " ")
    .replace(/[ ]{2,}/g, " ")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:|]+\s*$/, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 48) return false;
  const norm = normalizeHeading(t);
  if (STANDARD_SECTION_TITLES.has(norm)) return true;
  // Short all-caps lines ("TECHNICAL PROJECTS") are treated as headings.
  const letters = t.replace(/[^A-Za-z]/g, "");
  const words = t.split(/\s+/).filter(Boolean);
  return (
    letters.length >= 4 &&
    t === t.toUpperCase() &&
    words.length <= 4 &&
    !/[@\d]/.test(t) &&
    /^[A-Z&/ ,:-]+$/.test(t)
  );
}

export function parseResume(text: string): ResumeLine[] {
  const raw = normalizeText(text).split("\n");
  const out: ResumeLine[] = [];
  let section = "Header";
  let n = 0;
  for (const rawLine of raw) {
    const line = rawLine.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    if (isSectionHeading(line)) {
      section = toTitleCase(line.replace(/[:|]+\s*$/, ""));
      out.push({ id: `L${++n}`, kind: "heading", text: line.replace(/[:|]+\s*$/, ""), section });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet && line.length > bullet[0].length) {
      out.push({ id: `L${++n}`, kind: "bullet", text: line.slice(bullet[0].length).trim(), section });
      continue;
    }
    // A line starting in lowercase directly after a bullet is almost always a wrapped
    // continuation from PDF extraction; join it instead of creating a fake new line.
    if (prev && prev.kind === "bullet" && /^[a-z(]/.test(line)) {
      prev.text = `${prev.text} ${line}`;
      continue;
    }
    out.push({ id: `L${++n}`, kind: "text", text: line, section });
  }
  return out;
}

export function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (["and", "of", "the", "&"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Render lines back to plain text using a consistent "- " bullet marker. */
export function linesToText(lines: Pick<ResumeLine, "kind" | "text">[]): string {
  const parts: string[] = [];
  lines.forEach((l, i) => {
    if (l.kind === "heading") {
      if (i > 0) parts.push("");
      parts.push(l.text.toUpperCase());
    } else if (l.kind === "bullet") {
      parts.push(`- ${l.text}`);
    } else {
      parts.push(l.text);
    }
  });
  return parts.join("\n");
}

/** Text format given to the model: one line per row with id, kind and section. */
export function linesForPrompt(lines: ResumeLine[]): string {
  return lines.map((l) => `${l.id} [${l.kind}] (${l.section}) ${l.text}`).join("\n");
}

export interface ResumeStructure {
  name: string;
  contactLines: string[];
  sections: { title: string; lines: ResumeLine[] }[];
}

/** Group parsed lines for export: header (name + contact) then sections. */
export function structureResume(text: string): ResumeStructure {
  const lines = parseResume(text);
  const header = lines.filter((l) => l.section === "Header");
  const rest = lines.filter((l) => l.section !== "Header");
  const sections: ResumeStructure["sections"] = [];
  for (const l of rest) {
    if (l.kind === "heading") sections.push({ title: l.text, lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(l);
  }
  return {
    name: header[0]?.text ?? "",
    contactLines: header.slice(1).map((l) => l.text),
    sections,
  };
}
