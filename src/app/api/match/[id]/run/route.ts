import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { requireMatch, runMatch } from "@/lib/server/match/store";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { mode } = z.object({ mode: z.enum(["full", "reassess"]) }).parse(await readJson(req));
  const m = await requireMatch(id);
  const n = m.evidence.length;
  const reason = mode === "full" ? "Initial analysis" : n ? `Re-assessed with ${n} evidence item${n > 1 ? "s" : ""}` : "Re-assessed with updated resume";
  return json({ match: await runMatch(m, mode, reason) });
});
