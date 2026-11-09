import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler, readBody } from "@/lib/server/auth";
import { createUserClient, siteUrl } from "@/lib/server/supabase";

export const POST = authHandler(async (req) => {
  const { email } = z.object({ email: z.string().trim().email("Enter a valid email address.").max(320) }).parse(await readBody(req));
  const sb = await createUserClient();
  // The same answer whether or not the account exists, so this can't be used to discover accounts.
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/set-password` });
  if (error?.status === 429) return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
  return NextResponse.json({ ok: true });
});
