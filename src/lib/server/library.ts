import "server-only";
import { randomUUID } from "node:crypto";
import type { TrackerEntry } from "../tracker/types";
import { currentResumeText } from "../resume/compose";
import { coverLetterText } from "../facts";
import { parseLetter } from "../letter";
import { TEMPLATE_LIMIT, type LibraryItem, type LibraryKind } from "../types";
import { addLibraryItem, createWorkspace, docGet, docList, docPut, getLibraryItem, getWorkspace, listLibrary, saveWorkspace, updateLibraryItem } from "./db";
import { HttpError } from "./http";

// Saved Documents: up to three reusable templates per kind, plus unlimited documents
// generated for a specific application (kept with its tracker record).

export class TemplateConflict extends HttpError {
  constructor(message: string, code: "limit" | "name_exists" | "confirm_overwrite", existing: { id: string; title: string }[]) {
    super(409, message, { code, existing });
  }
}

export async function templates(kind?: LibraryKind): Promise<LibraryItem[]> {
  return (await listLibrary()).filter((i) => i.category === "template" && (!kind || i.kind === kind));
}

async function requireItem(id: string): Promise<LibraryItem> {
  const item = await getLibraryItem(id);
  if (!item) throw new HttpError(404, "Document not found.");
  return item;
}

/**
 * Save a reusable template. Overwriting is never silent: replacing an existing template
 * (by choice, by name clash, or because the limit is reached) requires confirmOverwrite.
 */
export async function saveTemplate(input: { kind: LibraryKind; name: string; content: string; replaceId?: string; confirmOverwrite?: boolean }): Promise<LibraryItem> {
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "Give the template a name.");
  if (!input.content.trim()) throw new HttpError(400, "The template is empty.");
  const existing = await templates(input.kind);
  const label = input.kind === "resume" ? "resume" : "cover letter";

  if (input.replaceId) {
    const target = existing.find((t) => t.id === input.replaceId);
    if (!target) throw new HttpError(404, "The template to replace no longer exists.");
    if (!input.confirmOverwrite) throw new TemplateConflict(`This will overwrite “${target.title}”.`, "confirm_overwrite", [{ id: target.id, title: target.title }]);
    return (await updateLibraryItem(target.id, { title: name, content: input.content }))!;
  }
  const sameName = existing.find((t) => t.title.toLowerCase() === name.toLowerCase());
  if (sameName) throw new TemplateConflict(`A ${label} template named “${sameName.title}” already exists.`, "name_exists", [{ id: sameName.id, title: sameName.title }]);
  if (existing.length >= TEMPLATE_LIMIT)
    throw new TemplateConflict(`You already have ${TEMPLATE_LIMIT} ${label} templates. Choose one to replace, or delete one first.`, "limit", existing.map((t) => ({ id: t.id, title: t.title })));
  return addLibraryItem({ kind: input.kind, category: "template", title: name, content: input.content });
}

export async function editTemplate(id: string, patch: { title?: string; content?: string; confirmOverwrite?: boolean }): Promise<LibraryItem> {
  const item = await requireItem(id);
  if (patch.content !== undefined && patch.content !== item.content && item.category === "template" && !patch.confirmOverwrite)
    throw new TemplateConflict(`Saving will overwrite the saved version of “${item.title}”.`, "confirm_overwrite", [{ id, title: item.title }]);
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new HttpError(400, "Name can’t be empty.");
    if (item.category === "template" && (await templates(item.kind)).some((x) => x.id !== id && x.title.toLowerCase() === t.toLowerCase()))
      throw new HttpError(409, `Another template is already named “${t}”.`);
  }
  return (await updateLibraryItem(id, { title: patch.title?.trim(), content: patch.content }))!;
}

export async function duplicateTemplate(id: string, opts: { replaceId?: string; confirmOverwrite?: boolean; name?: string }): Promise<LibraryItem> {
  const item = await requireItem(id);
  let name = opts.name?.trim() || `Copy of ${item.title}`;
  const taken = new Set((await templates(item.kind)).map((t) => t.title.toLowerCase()));
  for (let n = 2; !opts.replaceId && taken.has(name.toLowerCase()); n++) name = `Copy of ${item.title} (${n})`;
  return saveTemplate({ kind: item.kind, name, content: item.content, replaceId: opts.replaceId, confirmOverwrite: opts.confirmOverwrite });
}

/** The current final resume / cover letter of a Studio application. */
export async function workspaceDocument(workspaceId: string, kind: LibraryKind): Promise<{ title: string; content: string }> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new HttpError(404, "Application not found.");
  const content = kind === "resume" ? currentResumeText(ws) : ws.coverLetter ? coverLetterText(ws.coverLetter) : "";
  if (!content.trim()) throw new HttpError(400, kind === "resume" ? "This application has no resume yet." : "This application has no cover letter yet.");
  return { title: ws.title, content };
}

async function trackerFor(workspaceId: string): Promise<TrackerEntry | null> {
  return (await docList<TrackerEntry>("tracker")).find((e) => e.workspaceId === workspaceId) ?? null;
}

/**
 * Keep the application's final documents with the application (and its tracker record).
 * Saving again replaces the previous version for that application. Never changes status.
 */
export async function saveApplicationDocs(workspaceId: string, kinds: LibraryKind[]): Promise<LibraryItem[]> {
  const tracker = await trackerFor(workspaceId);
  const saved: LibraryItem[] = [];
  for (const kind of kinds) {
    const doc = await workspaceDocument(workspaceId, kind);
    const title = `${kind === "resume" ? "Resume" : "Cover letter"} — ${doc.title}`;
    const prev = (await listLibrary()).find((i) => i.category === "application" && i.workspaceId === workspaceId && i.kind === kind);
    const item = prev ? (await updateLibraryItem(prev.id, { title, content: doc.content, trackerId: tracker?.id ?? prev.trackerId }))! : await addLibraryItem({ kind, category: "application", title, content: doc.content, workspaceId, trackerId: tracker?.id ?? null });
    saved.push(item);
    if (tracker) {
      const field = kind === "resume" ? "resumeVersion" : "coverLetterVersion";
      const full = await docGet<TrackerEntry>("tracker", tracker.id);
      if (full) await docPut("tracker", { ...full, [field]: { ref: `library:${item.id}`, label: item.title } });
    }
  }
  return saved;
}

/** Link application documents saved before the tracker record existed. */
export async function linkApplicationDocs(workspaceId: string, trackerId: string): Promise<void> {
  for (const i of await listLibrary()) if (i.category === "application" && i.workspaceId === workspaceId && !i.trackerId) await updateLibraryItem(i.id, { trackerId });
}

/** Use a resume template as the starting point of a new Studio application. */
export async function startFromResumeTemplate(id: string): Promise<string> {
  const t = await requireItem(id);
  if (t.kind !== "resume") throw new HttpError(400, "Not a resume.");
  const ws = await createWorkspace(`New application (from “${t.title}”)`);
  ws.inputs.resumeText = t.content;
  // Templates may contain [placeholders]; the user reviews and confirms the text first.
  ws.inputs.resumeConfirmed = false;
  ws.inputs.resumeSource = { method: "paste", fileName: `Template: ${t.title}`, warnings: hasPlaceholders(t.content) ? ["This template still has [placeholders]. Replace them with your real details before confirming."] : [] };
  await saveWorkspace(ws);
  return ws.id;
}

/** Load a resume template into an existing application's resume (to review and confirm). */
export async function applyResumeTemplate(id: string, workspaceId: string): Promise<void> {
  const t = await requireItem(id);
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new HttpError(404, "Application not found.");
  if (ws.optimization) throw new HttpError(409, "This application already has resume suggestions. Start a new application to use a different resume.");
  ws.inputs.resumeText = t.content;
  ws.inputs.resumeConfirmed = false;
  ws.inputs.resumeSource = { method: "paste", fileName: `Template: ${t.title}`, warnings: hasPlaceholders(t.content) ? ["This template still has [placeholders]. Replace them before confirming."] : [] };
  await saveWorkspace(ws);
}

/** Use a cover letter template as the starting draft of an application's cover letter. */
export async function applyCoverTemplate(id: string, workspaceId: string, confirmOverwrite: boolean): Promise<void> {
  const t = await requireItem(id);
  if (t.kind !== "cover_letter") throw new HttpError(400, "Not a cover letter.");
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new HttpError(404, "Application not found.");
  if (ws.coverLetter && !confirmOverwrite) throw new TemplateConflict("This application already has a cover letter. Replace it with the template?", "confirm_overwrite", []);
  const p = parseLetter(t.content);
  ws.coverLetter = {
    tone: "professional",
    greeting: p.greeting || "Dear Hiring Manager,",
    paragraphs: (p.paragraphs.length ? p.paragraphs : [t.content]).map((text, i) => ({ id: randomUUID().slice(0, 8), text, purpose: i === 0 ? "Opening" : "From template" })),
    closing: p.closing || "Sincerely,",
    signatureName: p.signatureName,
    createdAt: new Date().toISOString(),
  };
  ws.review = undefined;
  await saveWorkspace(ws);
}

export function hasPlaceholders(text: string): boolean {
  return /\[[^\]\n]{2,60}\]/.test(text);
}

// ---------- Starter structures (no invented content: placeholders only) ----------

export const STARTERS: Record<string, { kind: LibraryKind; name: string; content: string }> = {
  "ux-ui-designer": {
    kind: "resume",
    name: "UX/UI Designer",
    content: `[Full name]
[email] | [phone] | [city, country] | [portfolio URL] | [LinkedIn URL]

PROFESSIONAL SUMMARY
[2–3 sentences: your design focus, the kinds of products you've designed, and the tools you use]

EXPERIENCE
[Job title], [Company] — [Month YYYY] – [Month YYYY or Present]
- [Action verb] [what you designed or researched] [result, only if you can verify it]
- [Action verb] [usability testing / design system work] [outcome]

PROJECTS
[Project name] — [portfolio link]
- [Problem, your role, methods (research, wireframes, prototypes), outcome]

SKILLS
[Figma, prototyping, user research, accessibility (WCAG), design systems, …]

EDUCATION
[Degree], [Institution] — [Year]`,
  },
  "software-engineer": {
    kind: "resume",
    name: "Software Engineer",
    content: `[Full name]
[email] | [phone] | [city, country] | [GitHub URL] | [LinkedIn URL]

PROFESSIONAL SUMMARY
[2–3 sentences: languages and domains you work in, the scale or type of systems]

EXPERIENCE
[Job title], [Company] — [Month YYYY] – [Month YYYY or Present]
- [Action verb] [feature/service you built] using [technologies] [measurable result if known]
- [Action verb] [reliability/performance/testing work] [outcome]

PROJECTS
[Project name] — [repository link]
- [What it does, your contribution, stack]

TECHNICAL SKILLS
Languages: [ … ]
Frameworks & tools: [ … ]
Cloud & DevOps: [ … ]

EDUCATION
[Degree], [Institution] — [Year]`,
  },
  "data-analyst": {
    kind: "resume",
    name: "Data Analyst",
    content: `[Full name]
[email] | [phone] | [city, country] | [LinkedIn URL] | [portfolio URL]

PROFESSIONAL SUMMARY
[2–3 sentences: the data you analyse, the decisions it supports, key tools]

EXPERIENCE
[Job title], [Company] — [Month YYYY] – [Month YYYY or Present]
- [Action verb] [analysis/report/dashboard] in [SQL/Python/Tableau/Power BI] for [audience] [result if verifiable]
- [Action verb] [data cleaning/modelling work] [outcome]

PROJECTS
[Project name] — [link]
- [Question, data source, methods, finding]

SKILLS
[SQL, Python (pandas), Excel, Tableau/Power BI, statistics, …]

EDUCATION
[Degree], [Institution] — [Year]`,
  },
  "cover-letter": {
    kind: "cover_letter",
    name: "General cover letter",
    content: `Dear [Hiring Manager's name or "Hiring Manager"],

[Opening: the role you're applying for and one specific reason you're a fit — a result, project or skill that matches the posting.]

[Evidence: two or three requirements from the posting, each matched to something you've actually done.]

[Why this company: something specific you know about them, from their own materials.]

[Closing: a brief summary and a clear next step.]

Sincerely,
[Full name]`,
  },
};
