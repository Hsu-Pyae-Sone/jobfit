import { z } from "zod";
import { deleteUserCompletely, requireAdmin, resendInvite } from "@/lib/server/admin";
import { ctx } from "@/lib/server/context";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { adminEmails } from "@/lib/server/supabase";

type Ctx = { params: Promise<{ id: string }> };
const Id = z.string().uuid();

export const POST = handle(async (req: Request, c: Ctx) => {
  requireAdmin();
  const id = Id.parse((await c.params).id);
  const { action } = z.object({ action: z.literal("resend") }).parse(await readJson(req));
  if (action === "resend") await resendInvite(id, adminEmails());
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, c: Ctx) => {
  requireAdmin();
  const id = Id.parse((await c.params).id);
  if (id === ctx().user.id) throw new HttpError(400, "To delete your own account, use Settings → Delete account.");
  await deleteUserCompletely(id);
  return json({ ok: true });
});
