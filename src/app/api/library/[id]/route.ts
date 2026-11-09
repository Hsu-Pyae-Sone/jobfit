import { z } from "zod";
import { deleteLibraryItem, getLibraryItem } from "@/lib/server/db";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { editTemplate } from "@/lib/server/library";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const item = await getLibraryItem(id);
  if (!item) throw new HttpError(404, "Document not found.");
  return json({ item });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patch = z
    .object({ title: z.string().max(120), content: z.string().min(1).max(60000), confirmOverwrite: z.boolean() })
    .partial()
    .parse(await readJson(req));
  return json({ item: await editTemplate(id, patch) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await deleteLibraryItem(id))) throw new HttpError(404, "Document not found.");
  return json({ ok: true });
});
