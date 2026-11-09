import { z } from "zod";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { addFeedback, removeFeedback } from "@/lib/server/tracker/store";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const note = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
      stage: z.string().trim().max(100).default(""),
      text: z.string().trim().min(1, "Write a note").max(10000),
    })
    .parse(await readJson(req));
  return json({ entry: await addFeedback(id, note) }, 201);
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const noteId = new URL(req.url).searchParams.get("noteId");
  if (!noteId) throw new HttpError(400, "noteId is required.");
  return json({ entry: await removeFeedback(id, noteId) });
});
