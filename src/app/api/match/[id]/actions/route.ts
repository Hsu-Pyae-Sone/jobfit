import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { addToTracker, prepareWorkspace, refreshResume, requireMatch } from "@/lib/server/match/store";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { action } = z.object({ action: z.enum(["prepare", "tracker", "refresh-resume"]) }).parse(await readJson(req));
  const m = await requireMatch(id);
  if (action === "prepare") return json({ workspaceId: await prepareWorkspace(m), match: await requireMatch(id) });
  if (action === "tracker") return json({ entry: await addToTracker(m), match: await requireMatch(id) });
  return json({ match: await refreshResume(m) });
});
