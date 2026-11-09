import { z } from "zod";
import { createWorkspace, listWorkspaces } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";

export const GET = handle(async () => json({ workspaces: await listWorkspaces() }));

export const POST = handle(async (req: Request) => {
  const body = z.object({ title: z.string().max(200).default("") }).parse(await readJson(req));
  return json({ workspace: await createWorkspace(body.title) }, 201);
});
