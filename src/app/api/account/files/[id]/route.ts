import { z } from "zod";
import { store } from "@/lib/server/context";
import { handle, HttpError, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const Id = z.string().uuid();

/** Download one of your uploaded originals. Always as an attachment, never rendered inline. */
export const GET = handle(async (_req: Request, c: Ctx) => {
  const got = await store().fileGet(Id.parse((await c.params).id));
  if (!got) throw new HttpError(404, "File not found.");
  const ascii = got.meta.fileName.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(got.bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(got.meta.fileName)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
});

export const DELETE = handle(async (_req: Request, c: Ctx) => {
  if (!(await store().fileDelete(Id.parse((await c.params).id)))) throw new HttpError(404, "File not found.");
  return json({ ok: true });
});
