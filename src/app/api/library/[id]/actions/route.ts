import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { applyCoverTemplate, applyResumeTemplate, duplicateTemplate, startFromResumeTemplate } from "@/lib/server/library";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("duplicate"), name: z.string().max(120).optional(), replaceId: z.string().max(64).optional(), confirmOverwrite: z.boolean().optional() }),
  /** Resume template -> new Studio application. */
  z.object({ action: z.literal("start") }),
  /** Template -> an existing application's resume or cover letter. */
  z.object({ action: z.literal("apply"), workspaceId: z.string().max(64), confirmOverwrite: z.boolean().default(false) }),
]);

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = Body.parse(await readJson(req));
  if (body.action === "duplicate") return json({ item: await duplicateTemplate(id, body) }, 201);
  if (body.action === "start") return json({ workspaceId: await startFromResumeTemplate(id) }, 201);
  const { getLibraryItem } = await import("@/lib/server/db");
  const item = await getLibraryItem(id);
  if (item?.kind === "cover_letter") await applyCoverTemplate(id, body.workspaceId, body.confirmOverwrite);
  else await applyResumeTemplate(id, body.workspaceId);
  return json({ workspaceId: body.workspaceId });
});
