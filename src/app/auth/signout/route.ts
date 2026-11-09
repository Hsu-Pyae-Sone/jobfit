import { NextResponse, type NextRequest } from "next/server";
import { createUserClient, supabaseConfigured } from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  if (supabaseConfigured()) {
    const sb = await createUserClient();
    await sb.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
