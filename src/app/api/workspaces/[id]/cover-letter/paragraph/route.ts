import { z } from "zod";
import { checkClaims } from "@/lib/claims";
import { coverLetterCorpus } from "@/lib/facts";
import { currentResumeText } from "@/lib/resume/compose";
import { saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, readJson, requireWorkspace } from "@/lib/server/http";
import { regenerateParagraph } from "@/lib/server/tasks";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = z
    .object({ paragraphId: z.string().max(40), instruction: z.string().max(500).default("") })
    .parse(await readJson(req));
  const ws = await requireWorkspace(id);
  const cl = ws.coverLetter;
  if (!cl) throw new HttpError(400, "Generate a cover letter first.");
  const index = cl.paragraphs.findIndex((p) => p.id === body.paragraphId);
  if (index < 0) throw new HttpError(404, "Paragraph not found.");
  const text = await regenerateParagraph(ws, cl, index, body.instruction, currentResumeText(ws));
  cl.paragraphs[index] = {
    ...cl.paragraphs[index],
    text,
    flags: checkClaims(text, coverLetterCorpus(ws), ws.analysis?.keywords.missing ?? []),
  };
  ws.review = undefined;
  return json({ workspace: await saveWorkspace(ws) });
});
