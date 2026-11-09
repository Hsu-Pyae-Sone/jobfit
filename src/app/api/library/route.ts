import { z } from "zod";
import type { TrackerEntry } from "@/lib/tracker/types";
import { TEMPLATE_LIMIT } from "@/lib/types";
import { docGet, listLibrary } from "@/lib/server/db";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { saveApplicationDocs, saveTemplate, STARTERS, workspaceDocument } from "@/lib/server/library";
import { getStatuses } from "@/lib/server/tracker/store";

export const GET = handle(async () => {
  const items = await listLibrary();
  const statuses = await getStatuses();
  const applicationDocs = await Promise.all(
    items
      .filter((i) => i.category === "application")
      .map(async (i) => {
        const t = i.trackerId ? await docGet<TrackerEntry>("tracker", i.trackerId) : null;
        return { ...i, tracker: t ? { id: t.id, title: t.title, company: t.company, status: statuses.find((s) => s.id === t.status)?.label ?? t.status } : null };
      }),
  );
  return json({
    templates: items.filter((i) => i.category === "template"),
    applicationDocs,
    limit: TEMPLATE_LIMIT,
    starters: Object.entries(STARTERS).map(([id, s]) => ({ id, kind: s.kind, name: s.name })),
  });
});

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("template"),
    kind: z.enum(["resume", "cover_letter"]),
    name: z.string().max(120),
    content: z.string().max(60000).optional(),
    fromWorkspaceId: z.string().max(64).optional(),
    starter: z.string().max(40).optional(),
    replaceId: z.string().max(64).optional(),
    confirmOverwrite: z.boolean().optional(),
  }),
  z.object({ action: z.literal("application"), workspaceId: z.string().max(64), kinds: z.array(z.enum(["resume", "cover_letter"])).min(1).max(2) }),
]);

export const POST = handle(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  if (body.action === "application") return json({ items: await saveApplicationDocs(body.workspaceId, body.kinds) }, 201);

  let content = body.content ?? "";
  if (body.fromWorkspaceId) content = (await workspaceDocument(body.fromWorkspaceId, body.kind)).content;
  if (body.starter) {
    const st = STARTERS[body.starter];
    if (!st || st.kind !== body.kind) throw new HttpError(400, "Unknown starter.");
    content = st.content;
  }
  const item = await saveTemplate({ kind: body.kind, name: body.name, content, replaceId: body.replaceId, confirmOverwrite: body.confirmOverwrite });
  return json({ item }, 201);
});
