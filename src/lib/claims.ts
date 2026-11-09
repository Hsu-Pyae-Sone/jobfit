import { isSectionHeading } from "./resume/parse";
import type { ClaimFlags } from "./types";

// Deterministic truthfulness guards. These never call the model: they compare new text
// against the information the user actually provided, so an invented metric or skill is
// flagged even if the model ignores its instructions.

const NUMBER_WORDS: Record<string, string> = {
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  fifteen: "15",
  twenty: "20",
  thirty: "30",
  fifty: "50",
  hundred: "100",
  thousand: "1000",
  dozen: "12",
  half: "50%",
  doubled: "2x",
  tripled: "3x",
  halved: "50%",
};

/** Canonical numeric tokens in a piece of text: "1,200" -> "1200", "18%" -> "18", "$2.5M" -> "2.5". */
export function extractNumbers(text: string): string[] {
  const found: string[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const canon = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    if (canon) found.push(canon);
  }
  return found;
}

function extractNumberWords(text: string): string[] {
  const found: string[] = [];
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w in NUMBER_WORDS) found.push(w);
  }
  return found;
}

/** Numbers (or numeric words) in `text` that do not appear anywhere in `corpus`. */
export function unsupportedNumbers(text: string, corpus: string): string[] {
  const corpusNums = new Set(extractNumbers(corpus));
  const corpusLower = corpus.toLowerCase();
  const out = new Set<string>();
  for (const n of extractNumbers(text)) {
    if (!corpusNums.has(n)) out.add(n);
  }
  for (const w of extractNumberWords(text)) {
    const digit = NUMBER_WORDS[w].replace(/[%x]/g, "");
    const inCorpus =
      new RegExp(`\\b${w}\\b`).test(corpusLower) || corpusNums.has(digit);
    if (!inCorpus) out.add(w);
  }
  return [...out];
}

const STOP_CAPS = new Set([
  "I", "A", "An", "The", "And", "Or", "For", "With", "To", "In", "On", "At", "By", "Of", "As",
  "My", "Our", "We", "Your", "This", "That", "These", "Those", "Dear", "Sincerely", "Regards",
  "Thank", "Thanks", "Best", "Hiring", "Manager", "Team", "Mr", "Ms", "Mrs", "Dr",
  "January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep",
  "Sept", "Oct", "Nov", "Dec", "Present", "Current",
]);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim();
  if (!t) return true;
  const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(t)}($|[^A-Za-z0-9])`, "i");
  return re.test(haystack);
}

/**
 * Proper nouns, tools, acronyms and job keywords in `text` that the user never mentioned.
 * `watchTerms` are extra phrases to check (e.g. the job's keywords the resume is missing),
 * which catches lowercase skills like "machine learning" being slipped into a bullet.
 */
export function newTerms(text: string, corpus: string, watchTerms: string[] = []): string[] {
  const out = new Set<string>();
  // Tech-ish tokens: contain an inner capital, digit, +, #, or . (Node.js, C++, AWS, PySpark)
  const tokenRe = /[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]/g;
  // Section headings ("PROFESSIONAL SUMMARY") are structure, not claims.
  const body = text
    .split("\n")
    .filter((l) => !isSectionHeading(l))
    .join("\n");
  const sentences = body.split(/(?<=[.!?])\s+|\n/);
  for (const sentence of sentences) {
    const tokens = sentence.match(tokenRe) ?? [];
    tokens.forEach((tok, i) => {
      const clean = tok.replace(/[.]+$/, "");
      if (clean.length < 2 || STOP_CAPS.has(clean)) return;
      const isAcronym = /^[A-Z0-9]{2,}$/.test(clean) && /[A-Z]/.test(clean);
      const isTechy = /[+#]|[a-z][A-Z]|\.[a-zA-Z]/.test(clean);
      const isProper = /^[A-Z]/.test(clean) && i > 0; // capitalised mid-sentence
      if (!(isAcronym || isTechy || isProper)) return;
      if (!containsTerm(corpus, clean)) out.add(clean);
    });
  }
  for (const term of watchTerms) {
    if (term && containsTerm(body, term) && !containsTerm(corpus, term)) {
      // Report "Power BI" once instead of "Power", "BI", "Power BI".
      for (const part of term.split(/\s+/)) out.delete(part);
      out.add(term);
    }
  }
  return [...out];
}

export const GENERIC_PHRASES = [
  "hardworking",
  "hard-working",
  "hard working",
  "team player",
  "passionate individual",
  "passionate about",
  "results-driven",
  "results driven",
  "results-oriented",
  "detail-oriented professional",
  "self-starter",
  "go-getter",
  "think outside the box",
  "dynamic individual",
  "highly motivated",
  "synergy",
  "proven track record",
  "best of breed",
  "go above and beyond",
  "i am writing to express my interest",
  "i am writing to apply",
  "to whom it may concern",
  "dear sir or madam",
  "i believe i would be a great fit",
  "perfect fit",
  "dream job",
];

export function genericPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.filter((p) => lower.includes(p));
}

export function checkClaims(text: string, corpus: string, watchTerms: string[] = []): ClaimFlags {
  return {
    unsupportedNumbers: unsupportedNumbers(text, corpus),
    newTerms: newTerms(text, corpus, watchTerms),
    genericPhrases: genericPhrases(text),
  };
}

export function hasClaimRisk(f?: ClaimFlags): boolean {
  return !!f && (f.unsupportedNumbers.length > 0 || f.newTerms.length > 0);
}
