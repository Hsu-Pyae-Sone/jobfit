import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/server/auth";
import { createUserClient, supabaseConfigured } from "@/lib/server/supabase";

// PKCE code exchange (used if an email template sends users here with ?code=...).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (supabaseConfigured() && code) {
    const sb = await createUserClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("This sign-in link is invalid or has expired.")}`, request.url));
}
