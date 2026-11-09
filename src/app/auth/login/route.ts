import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler, readBody } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/errors";
import { createUserClient } from "@/lib/server/supabase";

const Body = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = authHandler(async (req) => {
  const { email, password } = Body.parse(await readBody(req));
  const sb = await createUserClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
    if (/not confirmed/i.test(error.message)) throw new HttpError(400, "Please confirm your email address first, using the link in your invitation email.");
    throw new HttpError(400, "That email and password don’t match an account.");
  }
  return NextResponse.json({ ok: true });
});
