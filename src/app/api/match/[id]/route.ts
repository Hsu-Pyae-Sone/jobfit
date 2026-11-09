import { z } from "zod";
import { docDelete } from "@/lib/server/db";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { requireMatch, saveMatch } from "@/lib/server/match/store";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ match: await requireMatch(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const m = await requireMatch(id);
  const body = z
    .object({
      // Marking progress is tracking only — it never changes the verified score.
      gapProgress: z.record(z.string().max(10), z.enum(["not_started", "in_progress", "completed"])).optional(),
      fullDescription: z.string().min(50).max(40000).optional(),
    })
    .parse(await readJson(req));
  if (body.gapProgress) m.gapProgress = { ...m.gapProgress, ...body.gapProgress };
  if (body.fullDescription) {
    m.job.description = body.fullDescription.trim();
    m.job.descriptionComplete = true;
    m.state = "new";
    m.requirements = [];
    m.gaps = [];
  }
  return json({ match: await saveMatch(m) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!await docDelete("matches", id)) throw new HttpError(404, "Match analysis not found.");
  return json({ ok: true });
});
