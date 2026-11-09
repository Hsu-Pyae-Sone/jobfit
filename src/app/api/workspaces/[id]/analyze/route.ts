import { saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, requireWorkspace } from "@/lib/server/http";
import { analyze } from "@/lib/server/tasks";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ws = await requireWorkspace(id);
  const { resumeText, resumeConfirmed, jobText, jobConfirmed } = ws.inputs;
  if (!resumeText.trim() || !jobText.trim()) throw new HttpError(400, "Add both your resume and the job description first.");
  if (!resumeConfirmed || !jobConfirmed) throw new HttpError(400, "Confirm the extracted resume and job description text before analysis.");
  ws.analysis = await analyze(ws);
  // Answers to questions that no longer exist are kept harmlessly; the review is now stale.
  ws.review = undefined;
  return json({ workspace: await saveWorkspace(ws) });
});
