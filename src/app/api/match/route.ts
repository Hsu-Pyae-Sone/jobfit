import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { createMatch, listMatches } from "@/lib/server/match/store";

export const GET = handle(async () => json({ matches: await listMatches() }));

const Source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), jobId: z.string().max(200) }),
  z.object({ kind: z.literal("workspace"), workspaceId: z.string().max(64) }),
  z.object({ kind: z.literal("pasted"), title: z.string().max(200), company: z.string().max(200).optional(), text: z.string().min(1).max(40000) }),
]);

export const POST = handle(async (req: Request) => {
  const body = z.object({ source: Source, profileId: z.string().max(80) }).parse(await readJson(req));
  return json({ match: await createMatch(body.source, body.profileId) }, 201);
});
