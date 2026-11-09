import { z } from "zod";
import { deleteUserCompletely } from "@/lib/server/admin";
import { ctx } from "@/lib/server/context";
import { handle, json, readJson } from "@/lib/server/http";
import { createUserClient } from "@/lib/server/supabase";

/**
 * Permanently delete the signed-in account: uploaded files, then the user (every table row
 * cascades from auth.users). In local mode, all locally stored data is erased.
 */
export const POST = handle(async (req: Request) => {
  z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm." }) }).parse(await readJson(req));
  const c = ctx();
  if (c.mode === "local") {
    await c.store.wipeAll();
    return json({ ok: true, signedOut: false });
  }
  await deleteUserCompletely(c.user.id);
  // Clear the session cookie; the account no longer exists.
  const sb = await createUserClient();
  await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  return json({ ok: true, signedOut: true });
});
