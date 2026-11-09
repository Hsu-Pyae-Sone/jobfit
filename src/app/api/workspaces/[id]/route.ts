import { z } from "zod";
import { checkClaims } from "@/lib/claims";
import { coverLetterCorpus } from "@/lib/facts";
import { deleteWorkspace, saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, readJson, requireWorkspace } from "@/lib/server/http";

const MAX_TEXT = 60_000;
const text = (max = MAX_TEXT) => z.string().max(max);
const source = z
  .object({
    method: z.enum(["paste", "pdf-text", "docx", "ocr-tesseract", "ocr-ai", "url", "text-file", "profile"]),
    fileName: z.string().max(300).optional(),
    warnings: z.array(z.string().max(500)).max(10).optional(),
  })
  .optional();

const PatchSchema = z.object({
  title: text(200).optional(),
  inputs: z
    .object({
      resumeText: text().optional(),
      resumeConfirmed: z.boolean().optional(),
      resumeSource: source,
      jobText: text().optional(),
      jobConfirmed: z.boolean().optional(),
      jobSource: source,
      extra: z
        .object({
          education: text(10000),
          experience: text(10000),
          projects: text(10000),
          achievements: text(10000),
          certifications: text(10000),
          skills: text(10000),
        })
        .partial()
        .optional(),
      company: z.object({ name: text(200), url: text(2000), notes: text(10000), pageText: text(40000) }).partial().optional(),
      targetRole: text(200).optional(),
      targetIndustry: text(200).optional(),
    })
    .optional(),
  answers: z.record(z.string(), z.object({ answer: text(2000), noNumber: z.boolean() })).optional(),
  decisions: z.record(z.string(), z.enum(["pending", "accepted", "rejected"])).optional(),
  edits: z.record(z.string(), text(3000)).optional(),
  confirmations: z.record(z.string(), z.boolean()).optional(),
  finalResume: text().nullable().optional(),
  coverLetter: z
    .object({
      greeting: text(300),
      closing: text(300),
      signatureName: text(200),
      paragraphs: z.array(z.object({ id: z.string().max(40), text: text(4000), purpose: text(300) })).max(10),
    })
    .partial()
    .optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ workspace: await requireWorkspace(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ws = await requireWorkspace(id);
  const patch = PatchSchema.parse(await readJson(req));

  if (patch.title !== undefined) ws.title = patch.title.trim() || ws.title;

  if (patch.inputs) {
    const p = patch.inputs;
    const prev = ws.inputs;
    const resumeChanged = p.resumeText !== undefined && p.resumeText !== prev.resumeText;
    const jobChanged = p.jobText !== undefined && p.jobText !== prev.jobText;
    ws.inputs = {
      ...prev,
      ...p,
      extra: { ...prev.extra, ...p.extra },
      company: { ...prev.company, ...p.company },
    };
    // Edited text must be re-confirmed before it is analysed.
    if (resumeChanged && p.resumeConfirmed === undefined) ws.inputs.resumeConfirmed = false;
    if (jobChanged && p.jobConfirmed === undefined) ws.inputs.jobConfirmed = false;
    // Suggestions reference resume line ids, so they are invalid once the resume changes.
    if (resumeChanged) {
      ws.optimization = undefined;
      ws.decisions = {};
      ws.edits = {};
      ws.confirmations = {};
      ws.finalResume = null;
    }
  }

  if (patch.answers) ws.answers = { ...ws.answers, ...patch.answers };
  if (patch.decisions) ws.decisions = { ...ws.decisions, ...patch.decisions };
  if (patch.edits) {
    ws.edits = { ...ws.edits, ...patch.edits };
    // A confirmation covers the exact text the user saw; editing it requires re-confirming.
    for (const sid of Object.keys(patch.edits)) {
      if (patch.confirmations?.[sid] === undefined) ws.confirmations[sid] = false;
    }
  }
  if (patch.confirmations) ws.confirmations = { ...ws.confirmations, ...patch.confirmations };
  if (patch.finalResume !== undefined) ws.finalResume = patch.finalResume;

  if (patch.coverLetter) {
    if (!ws.coverLetter) throw new HttpError(400, "Generate a cover letter first.");
    const corpus = coverLetterCorpus(ws);
    const watch = ws.analysis?.keywords.missing ?? [];
    const cl = { ...ws.coverLetter, ...patch.coverLetter };
    if (patch.coverLetter.paragraphs) {
      cl.paragraphs = patch.coverLetter.paragraphs.map((p) => ({ ...p, flags: checkClaims(p.text, corpus, watch) }));
    }
    ws.coverLetter = cl;
  }

  return json({ workspace: await saveWorkspace(ws) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!await deleteWorkspace(id)) throw new HttpError(404, "Application not found.");
  return json({ ok: true });
});
