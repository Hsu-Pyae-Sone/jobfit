import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler, PASSWORD_MIN, readBody } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/errors";
import { createUserClient, signupsAllowed, siteUrl } from "@/lib/server/supabase";

// Public registration is off during the private beta (accounts come from admin invitations).
// To open it later: set ALLOW_SIGNUPS=1 and enable sign-ups in the Supabase dashboard.
const Body = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(200),
});

export const POST = authHandler(async (req) => {
  if (!signupsAllowed()) throw new HttpError(403, "Jobfit is invite-only right now.");
  const { email, password } = Body.parse(await readBody(req));
  const sb = await createUserClient();
  const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${siteUrl()}/auth/confirm` } });
  if (error?.status === 429) throw new HttpError(429, "Too many requests. Please wait a few minutes and try again.");
  // Same response whether or not the address is already registered.
  return NextResponse.json({ ok: true });
});
