import { z } from "zod";
import type { Compatibility, ResultJob } from "@/lib/jobs/types";
import { getStoredJob } from "@/lib/server/db";
import { requireAiConsent } from "@/lib/server/ai";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { assessJob } from "@/lib/server/jobs/assess";
import { getProfile } from "@/lib/server/jobs/profiles";

export const maxDuration = 300;

export const POST = handle(async (req: Request) => {
  const body = z.object({ jobIds: z.array(z.string().max(200)).min(1).max(10), profileId: z.string().max(80) }).parse(await readJson(req));
  const profile = await getProfile(body.profileId);
  if (!profile) throw new HttpError(400, "Choose a resume to compare against.");
  await requireAiConsent();
  const jobs = (await Promise.all(body.jobIds.map((id) => getStoredJob<ResultJob>(id)))).filter(Boolean) as ResultJob[];
  if (!jobs.length) throw new HttpError(404, "These jobs are no longer available. Run the search again.");

  // A few at a time to stay within rate limits.
  const results: Record<string, Compatibility> = {};
  const errors: string[] = [];
  let firstError: unknown = null;
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = jobs.slice(i, i + 3);
    const settled = await Promise.allSettled(batch.map((j) => assessJob(j, profile)));
    settled.forEach((r, n) => {
      if (r.status === "fulfilled") results[batch[n].id] = r.value;
      else {
        firstError ??= r.reason;
        errors.push((r.reason as Error).message);
      }
    });
  }
  // Nothing succeeded: report the real error (e.g. daily limit reached) with its own status.
  if (!Object.keys(results).length) throw firstError ?? new HttpError(502, "The assessment failed.");
  return json({ results, errors: [...new Set(errors)] });
});
