import type { EmploymentType, ExperienceLevel, Salary, Sourced, WorkArrangement } from "./types";

// Deterministic field extraction from published job data. Only explicit statements are
// used; anything not stated stays null and is shown as "Not provided".

const EMPLOYMENT_WORDS: [RegExp, EmploymentType[]][] = [
  [/\b(full[\s-]?time|fulltime|vollzeit|kokoaikainen|heltid)\b/i, ["full_time"]],
  [/\b(part[\s-]?time|teilzeit|osa-?aikainen|deltid|working student|werkstudent)\b/i, ["part_time"]],
  [/\b(contract|contractor|freelance|freiberuflich)\b/i, ["contract"]],
  [/\b(intern|internship|praktikum|trainee|harjoittelu)\b/i, ["internship"]],
  [/\b(temporary|temp|fixed[\s-]?term|befristet|befristeter|määräaikainen|seasonal)\b/i, ["temporary"]],
];

/** Map provider job-type labels ("Full Time", "Befristeter arbeitsvertrag", "freelance") to our types. */
export function employmentFromLabels(labels: string[]): EmploymentType[] {
  const out = new Set<EmploymentType>();
  for (const l of labels) {
    if (/unbefristet/i.test(l)) continue; // "permanent" is not one of the types; also contains "befristet"
    for (const [re, types] of EMPLOYMENT_WORDS) if (re.test(l)) types.forEach((t) => out.add(t));
  }
  return [...out];
}

export function experienceFromTitle(title: string): ExperienceLevel | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship|praktikant|trainee|working student|werkstudent|summer job)\b/.test(t)) return "internship";
  if (/\b(junior|jr\.?|entry[\s-]level|graduate|apprentice)\b/.test(t)) return "entry";
  if (/\b(principal|head of|director|vp|vice president|chief|staff engineer|lead|team lead)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(mid[\s-]?level|intermediate)\b/.test(t)) return "mid";
  return null;
}

export function experienceFromLabels(labels: string[]): ExperienceLevel | null {
  const s = labels.join(" ").toLowerCase();
  if (/\b(internship|intern|student|hilfstätigkeit)\b/.test(s)) return "internship";
  if (/\b(entry|junior|berufseinsteiger|graduate)\b/.test(s)) return "entry";
  if (/\b(senior)\b/.test(s)) return "senior";
  if (/\b(lead|manager|executive|führungskraft)\b/.test(s)) return "lead";
  if (/\b(mid|berufserfahren|experienced)\b/.test(s)) return "mid";
  return null;
}

export function arrangementFromText(text: string): WorkArrangement | null {
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\b(fully remote|100% remote|remote[\s-]first|remote position|work from anywhere|remote-only)\b/.test(t)) return "remote";
  if (/\b(on[\s-]?site only|fully on[\s-]?site|100% on[\s-]?site|in[\s-]office only)\b/.test(t)) return "onsite";
  return null;
}

export function sourced<T>(value: T | null | undefined, from: Sourced<T>["from"]): Sourced<T> | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return { value, from };
}

const CURRENCY_SYMBOLS: [RegExp, string][] = [
  [/€|\beur\b|\beuro/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\bus\$|\busd\b|\$/i, "USD"],
  [/\bchf\b/i, "CHF"],
  [/\bsek\b/i, "SEK"],
  [/\bnok\b/i, "NOK"],
  [/\bdkk\b/i, "DKK"],
  [/\bpln\b|zł/i, "PLN"],
  [/\bcad\b|c\$/i, "CAD"],
  [/\baud\b|a\$/i, "AUD"],
  [/\binr\b|₹/i, "INR"],
];

/** Parse a published salary string. Unparseable parts stay null; `text` is kept verbatim. */
export function parseSalary(text: string | null | undefined, fallbackCurrency: string | null = null): Salary | null {
  const t = (text ?? "").trim();
  if (!t || !/\d/.test(t)) return null;
  let currency: string | null = null;
  for (const [re, code] of CURRENCY_SYMBOLS) {
    if (re.test(t)) {
      currency = code;
      break;
    }
  }
  currency ??= fallbackCurrency;
  const nums: number[] = [];
  const re = /(\d+(?:[.,]\d+)*)\s*([kK])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let raw = m[1];
    // "35,3k" -> 35.3k ; "52,000" -> 52000
    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, "");
    else raw = raw.replace(",", ".");
    let n = parseFloat(raw);
    if (Number.isNaN(n)) continue;
    if (m[2]) n *= 1000;
    nums.push(n);
  }
  const period: Salary["period"] = /\/\s*(month|mo)\b|per month|monthly|\bkk\b|monat/i.test(t)
    ? "month"
    : /\/\s*(hour|hr|h)\b|per hour|hourly|stunde/i.test(t)
      ? "hour"
      : /per day|\/\s*day|daily/i.test(t)
        ? "day"
        : /year|annual|\/\s*yr|p\.?a\.?|jahr/i.test(t) || nums.some((n) => n >= 10000)
          ? "year"
          : null;
  const vals = nums.filter((n) => n > 0);
  return {
    text: t,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
    currency,
    period,
  };
}

/** Annual amount for comparisons, or null when the period is unknown or hourly/daily. */
export function annual(n: number | null, period: Salary["period"]): number | null {
  if (n === null) return null;
  if (period === "year") return n;
  if (period === "month") return n * 12;
  return null;
}

const SECTION_HEAD =
  /^(requirements?|qualifications?|what you('ll)? (bring|need|have)|who you are|your profile|about you|you have|must[\s-]have|skills( and| &) experience|what we('re)? look(ing)? for|minimum qualifications|basic qualifications|ihr profil|dein profil|das bringst du mit|anforderungen|odotamme|edellytämme|vaatimukset|profil recherché|votre profil)\b/i;
const SECTION_END =
  /^(benefits|what we offer|we offer|perks|about us|about the company|why join|how to apply|nice[\s-]to[\s-]have|bonus|wir bieten|das bieten wir|tarjoamme|nous offrons|responsibilities|your (role|tasks)|what you('ll)? do|deine aufgaben|ihre aufgaben)\b/i;

/** Lines under a "Requirements / Qualifications" heading in the description, quoted as written. */
export function extractQualifications(description: string): string[] | null {
  const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const bare = line.replace(/^[-•*]\s*/, "").replace(/[:：]$/, "");
    if (bare.length < 60 && SECTION_HEAD.test(bare)) {
      inSection = true;
      continue;
    }
    if (inSection && bare.length < 60 && SECTION_END.test(bare)) {
      if (out.length) break;
      inSection = false;
      continue;
    }
    if (inSection) {
      if (bare.length >= 3) out.push(bare);
      if (out.length >= 15) break;
    }
  }
  return out.length ? out : null;
}

const LANGUAGES: Record<string, RegExp> = {
  English: /\b(english|englisch|englanti)\b/i,
  German: /\b(german|deutsch|saksa)\b/i,
  Finnish: /\b(finnish|suomi|suomen kieli|finnisch)\b/i,
  Swedish: /\b(swedish|svenska|ruotsi|schwedisch)\b/i,
  French: /\b(french|français|französisch|ranska)\b/i,
  Dutch: /\b(dutch|nederlands|niederländisch)\b/i,
  Spanish: /\b(spanish|español|spanisch)\b/i,
  Italian: /\b(italian|italiano|italienisch)\b/i,
  Polish: /\b(polish|polski)\b/i,
  Portuguese: /\b(portuguese|português)\b/i,
  Norwegian: /\b(norwegian|norsk)\b/i,
  Danish: /\b(danish|dansk)\b/i,
  Japanese: /\b(japanese)\b/i,
  Chinese: /\b(mandarin|chinese|cantonese)\b/i,
};
const LANG_CONTEXT =
  /\b(fluent|fluency|native|proficien\w*|skills?|level|written|spoken|kenntnisse|sprachkenntnisse|verhandlungssicher|fließend|taito|kielitaito|required|must|c1|c2|b1|b2|business[\s-]level|working knowledge|mother tongue)\b/i;

/** Languages explicitly stated as needed (a language word next to "fluent", "C1", "skills", ...). */
export function requiredLanguages(description: string): string[] | null {
  const found = new Set<string>();
  for (const sentence of description.split(/(?<=[.!?])\s+|\n/)) {
    if (!LANG_CONTEXT.test(sentence)) continue;
    for (const [lang, re] of Object.entries(LANGUAGES)) if (re.test(sentence)) found.add(lang);
  }
  return found.size ? [...found] : null;
}

const STOPWORDS: Record<string, string[]> = {
  English: ["the", "and", "you", "with", "our", "for", "will", "are", "your", "we"],
  German: ["und", "die", "der", "wir", "sie", "mit", "für", "das", "ist", "du"],
  Finnish: ["ja", "on", "että", "sinä", "meillä", "tai", "työ", "kanssa", "olet", "voit"],
  Swedish: ["och", "att", "det", "som", "för", "med", "är", "vi", "du", "på"],
  French: ["et", "les", "des", "vous", "nous", "pour", "une", "est", "dans", "avec"],
  Dutch: ["en", "het", "een", "van", "je", "wij", "voor", "met", "zijn", "ons"],
  Spanish: ["y", "los", "las", "para", "con", "una", "por", "que", "del", "nuestro"],
};

/** The language the posting is written in (by common-word frequency), or null if unclear. */
export function postingLanguage(text: string): string | null {
  const words = text.toLowerCase().match(/\p{L}+/gu)?.slice(0, 600) ?? [];
  if (words.length < 30) return null;
  const counts = Object.entries(STOPWORDS).map(([lang, sw]) => [lang, words.filter((w) => sw.includes(w)).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  const [best, second] = counts;
  if (best[1] < 8 || best[1] < second[1] * 1.6) return null;
  return best[0];
}

export function dedupeKey(title: string, company: string | null, city: string | null): string {
  const f = (s: string | null) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\((m|w|f|d|x|all genders?)[/|,]?[^)]*\)/g, "")
      .replace(/\b(gmbh|ag|ltd|limited|inc|oy|ab|bv|llc|sa|plc)\b\.?/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${f(title)}|${f(company)}|${f(city)}`;
}
