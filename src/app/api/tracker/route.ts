import { z } from "zod";
import type { MatchAnalysis } from "@/lib/match/types";
import { docGet } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";
import { currentScore, getWeights } from "@/lib/server/match/store";
import { EntryFields } from "@/lib/server/tracker/schemas";
import { createEntry, createFromJob, createFromWorkspace, getStatuses, listEntries, versionOptions } from "@/lib/server/tracker/store";

export const GET = handle(async () => {
  // Match scores are shown live from their analysis (they change only when evidence is re-assessed).
  const weights = await getWeights();
  const entries = await Promise.all(
    (await listEntries()).map(async (e) => {
      if (!e.matchId) return e;
      const m = await docGet<MatchAnalysis>("matches", e.matchId);
      return m ? { ...e, matchScore: currentScore(m, weights) } : e;
    }),
  );
  return json({ entries, statuses: await getStatuses(), versions: await versionOptions() });
});

export const POST = handle(async (req: Request) => {
  const body = z
    .union([z.object({ fromJobId: z.string().max(200) }), z.object({ fromWorkspaceId: z.string().max(64) }), z.object({ entry: EntryFields })])
    .parse(await readJson(req));
  if ("fromJobId" in body) return json({ entry: await createFromJob(body.fromJobId) }, 201);
  if ("fromWorkspaceId" in body) return json({ entry: await createFromWorkspace(body.fromWorkspaceId) }, 201);
  return json({ entry: await createEntry({ ...body.entry, source: "manual" }) }, 201);
});
