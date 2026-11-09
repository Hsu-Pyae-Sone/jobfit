import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/server/auth";
import { createUserClient, supabaseConfigured } from "@/lib/server/supabase";

// Email links (invite, password recovery, sign-up confirmation) land here with a one-time
// token. Verifying it on the server starts the session in an httpOnly cookie.
const TYPES = new Set<EmailOtpType>(["invite", "recovery", "signup", "email", "email_change", "magiclink"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const needsPassword = type === "invite" || type === "recovery";
  const next = safeNext(url.searchParams.get("next"), needsPassword ? "/auth/set-password" : "/");
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url));

  if (!supabaseConfigured()) return fail("Sign-in isn’t set up on this server.");
  if (!tokenHash || !type || !TYPES.has(type)) return fail("This link is incomplete. Please use the full link from your email.");
  const sb = await createUserClient();
  const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail("This link has expired or was already used. Ask for a new invitation or reset your password.");
  return NextResponse.redirect(new URL(next, request.url));
}
