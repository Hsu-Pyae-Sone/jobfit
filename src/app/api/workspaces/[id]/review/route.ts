import { z } from "zod";
import { coverLetterCorpus, userFactsCorpus } from "@/lib/facts";
import { currentResumeText } from "@/lib/resume/compose";
import { automaticReview } from "@/lib/review";
import { aiConfigured } from "@/lib/server/ai";
import { saveWorkspace } from "@/lib/server/db";
import { contentHash, letterPlainText } from "@/lib/server/documents";
import { handle, json, readJson, requireWorkspace } from "@/lib/server/http";
import { aiReview } from "@/lib/server/tasks";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { includeAi } = z.object({ includeAi: z.boolean().default(true) }).parse(await readJson(req));
  const ws = await requireWorkspace(id);
  const resumeText = currentResumeText(ws);
  const coverText = letterPlainText(ws);
  const kw = ws.analysis?.keywords;

  const items = automaticReview({
    resumeText,
    coverLetterText: coverText,
    resumeCorpus: userFactsCorpus(ws),
    coverCorpus: coverLetterCorpus(ws),
    jobKeywords: kw ? [...kw.matched, ...kw.missing] : [],
    missingKeywords: kw?.missing ?? [],
  });

  const useAi = includeAi && aiConfigured();
  if (useAi) items.push(...(await aiReview(ws, resumeText, coverText)));

  ws.review = { items, contentHash: contentHash(ws), aiIncluded: useAi, createdAt: new Date().toISOString() };
  return json({ workspace: await saveWorkspace(ws) });
});
