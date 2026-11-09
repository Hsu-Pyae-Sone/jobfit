import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler, readBody } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/errors";
import { createUserClient } from "@/lib/server/supabase";

// Fallback for Supabase's default email templates, which put the session in the URL
// fragment (#access_token=...). The set-password page posts it here once so the session
// moves into an httpOnly cookie; Supabase verifies the tokens before they are used.
const Body = z.object({ access_token: z.string().min(20).max(8000), refresh_token: z.string().min(5).max(2000) });

export const POST = authHandler(async (req) => {
  const tokens = Body.parse(await readBody(req));
  const sb = await createUserClient();
  const { error } = await sb.auth.setSession(tokens);
  if (error) throw new HttpError(400, "This link has expired or was already used.");
  return NextResponse.json({ ok: true });
});
