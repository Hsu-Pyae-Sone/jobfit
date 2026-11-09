import type { ResultJob } from "@/lib/jobs/types";
import { getStoredJob } from "@/lib/server/db";
import { handle, HttpError, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const job = await getStoredJob<ResultJob>(decodeURIComponent(id));
  if (!job) throw new HttpError(404, "This job is no longer available. Run the search again.");
  return json({ job });
});
