import { z } from "zod";
import { currentResumeText } from "@/lib/resume/compose";
import { saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, readJson, requireWorkspace } from "@/lib/server/http";
import { generateCoverLetter } from "@/lib/server/tasks";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { tone } = z.object({ tone: z.enum(["professional", "confident", "concise"]) }).parse(await readJson(req));
  const ws = await requireWorkspace(id);
  if (!ws.analysis) throw new HttpError(400, "Run the analysis first.");
  ws.coverLetter = await generateCoverLetter(ws, tone, currentResumeText(ws));
  ws.review = undefined;
  return json({ workspace: await saveWorkspace(ws) });
});
