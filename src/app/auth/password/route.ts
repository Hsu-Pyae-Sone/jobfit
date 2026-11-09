import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler, PASSWORD_MIN, readBody } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/errors";
import { createUserClient } from "@/lib/server/supabase";

const Body = z.object({
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(200),
  displayName: z.string().trim().max(80).optional(),
});

/** Set a password for the signed-in user (after an invite or a password-reset link). */
export const POST = authHandler(async (req) => {
  const { password, displayName } = Body.parse(await readBody(req));
  const sb = await createUserClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new HttpError(401, "Your link has expired. Ask for a new invitation or reset your password again.");
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) throw new HttpError(400, "Choose a password different from your current one.");
    if (/weak|pwned|leaked/i.test(error.message)) throw new HttpError(400, "That password is too easy to guess. Please choose a stronger one.");
    throw new HttpError(400, "Could not set the password. Please try again.");
  }
  if (displayName) {
    await sb.from("profiles").update({ display_name: displayName, updated_at: new Date().toISOString() }).eq("id", userId);
  }
  return NextResponse.json({ ok: true });
});
