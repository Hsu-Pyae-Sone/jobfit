import { handle, json, readJson } from "@/lib/server/http";
import { EntryFields } from "@/lib/server/tracker/schemas";
import { deleteEntry, getEntry, updateEntry } from "@/lib/server/tracker/store";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ entry: await getEntry(id) });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json({ entry: await updateEntry(id, EntryFields.parse(await readJson(req))) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteEntry(id);
  return json({ ok: true });
});
