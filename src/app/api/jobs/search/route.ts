import { z } from "zod";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { getProfile } from "@/lib/server/jobs/profiles";
import { FiltersSchema, LocationSchema } from "@/lib/server/jobs/schemas";
import { searchJobs, SearchInputError } from "@/lib/server/jobs/search";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const body = z
    .object({ location: LocationSchema, filters: FiltersSchema, profileId: z.string().max(80).nullable().optional() })
    .parse(await readJson(req));
  const profile = await getProfile(body.profileId);
  if (body.profileId && !profile) throw new HttpError(404, "The selected resume no longer exists.");
  try {
    return json(await searchJobs(body.location, body.filters, profile));
  } catch (e) {
    if (e instanceof SearchInputError) throw new HttpError(400, e.message);
    throw e;
  }
});
