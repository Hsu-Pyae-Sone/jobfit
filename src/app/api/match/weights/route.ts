import { z } from "zod";
import { DEFAULT_WEIGHTS } from "@/lib/match/types";
import { handle, json, readJson } from "@/lib/server/http";
import { getWeights, setWeights } from "@/lib/server/match/store";

export const GET = handle(async () => json({ weights: await getWeights(), defaults: DEFAULT_WEIGHTS }));

const W = z.number().min(0).max(100);
export const PUT = handle(async (req: Request) => {
  const body = z
    .object({ required_skill: W, experience: W, education: W, preferred_skill: W, other: W })
    .partial()
    .parse(await readJson(req));
  return json({ weights: await setWeights(body) });
});
