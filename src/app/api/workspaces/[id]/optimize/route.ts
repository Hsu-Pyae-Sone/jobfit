import { saveWorkspace } from "@/lib/server/db";
import { handle, HttpError, json, requireWorkspace } from "@/lib/server/http";
import { optimize } from "@/lib/server/tasks";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ws = await requireWorkspace(id);
  if (!ws.analysis) throw new HttpError(400, "Run the analysis first.");
  ws.optimization = await optimize(ws);
  // New suggestions start undecided; nothing is applied until the user accepts it.
  ws.decisions = {};
  ws.edits = {};
  ws.confirmations = {};
  ws.finalResume = null;
  ws.review = undefined;
  return json({ workspace: await saveWorkspace(ws) });
});
