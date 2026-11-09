import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiError } from "./ai";
import { ExtractError } from "./extract";
import { FetchUrlError } from "./fetch-url";
import { getWorkspace } from "./db";
import { HttpError } from "./errors";
import { resolveRequestContext, runWithContext } from "./context";
import { TemplateLimitError } from "./store/types";
import type { Workspace } from "../types";

export { HttpError };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wrap a route handler: resolve the signed-in user (401 if none), run the handler with
 * that user's data access, and turn known errors into clean JSON responses.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const context = await resolveRequestContext();
      return await runWithContext(context, () => fn(...args));
    } catch (err) {
      if (err instanceof TemplateLimitError) return json({ error: "You already have 3 templates of this kind.", code: "limit", existing: [] }, 409);
      if (err instanceof HttpError) return json({ error: err.message, ...err.details }, err.status);
      if (err instanceof AiError || err instanceof ExtractError) return json({ error: err.message }, err.status);
      if (err instanceof FetchUrlError) return json({ error: err.message }, 422);
      if (err instanceof ZodError) return json({ error: "Invalid request.", issues: err.issues.slice(0, 5) }, 400);
      console.error(err);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  };
}

export async function requireWorkspace(id: string): Promise<Workspace> {
  const ws = await getWorkspace(id);
  if (!ws) throw new HttpError(404, "Application not found.");
  return ws;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}
