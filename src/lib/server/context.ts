import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { HttpError } from "./errors";
import { SqliteSharedStore, SqliteUserStore } from "./store/sqlite";
import { SupabaseSharedStore, SupabaseUserStore } from "./store/supabase";
import type { SharedStore, UserStore } from "./store/types";
import { adminClient, adminEmails, createUserClient, localModeAllowed, supabaseConfigured } from "./supabase";

export interface RequestContext {
  mode: "supabase" | "local";
  user: { id: string; email: string; isAdmin: boolean };
  store: UserStore;
  shared: SharedStore;
}

const als = new AsyncLocalStorage<RequestContext>();

let local: RequestContext | null = null;
function localContext(): RequestContext {
  local ??= {
    mode: "local",
    user: { id: "local", email: "local@localhost", isAdmin: true },
    store: new SqliteUserStore(),
    shared: new SqliteSharedStore(),
  };
  return local;
}

/** Resolve who is making this request. Throws 401 when signed out. */
export async function resolveRequestContext(): Promise<RequestContext> {
  if (supabaseConfigured()) {
    const sb = await createUserClient();
    const { data, error } = await sb.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) throw new HttpError(401, "Please sign in.");
    const email = String(claims.email ?? "").toLowerCase();
    return {
      mode: "supabase",
      user: { id: claims.sub, email, isAdmin: adminEmails().includes(email) },
      store: new SupabaseUserStore(sb, claims.sub),
      shared: new SupabaseSharedStore(adminClient()),
    };
  }
  if (localModeAllowed()) return localContext();
  throw new HttpError(503, "The server isn’t configured: set the Supabase environment variables.");
}

export function runWithContext<T>(c: RequestContext, fn: () => Promise<T>): Promise<T> {
  return als.run(c, fn);
}

/** The current request's user and storage. In local mode (dev/tests) a single local user. */
export function ctx(): RequestContext {
  const c = als.getStore();
  if (c) return c;
  if (localModeAllowed()) return localContext();
  throw new Error("No request context: personal data accessed outside an authenticated request.");
}

export const store = () => ctx().store;
export const shared = () => ctx().shared;
