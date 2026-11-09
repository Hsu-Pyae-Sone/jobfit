import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./errors";
import { supabaseConfigured } from "./env";

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export const PASSWORD_MIN = 10;

/** JSON handler for the public /auth/* endpoints (no signed-in user required). */
export function authHandler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      if (!supabaseConfigured()) throw new HttpError(503, "Sign-in isn’t set up on this server (Supabase is not configured).");
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, ...err.details }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request." }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}
