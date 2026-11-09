import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";
import { HttpError } from "./errors";

export { localModeAllowed, signupsAllowed, supabaseConfigured, supabaseEnv } from "./env";

// Supabase configuration. The publishable (anon) key is safe for browsers; the secret
// (service role) key bypasses row-level security and must only ever be used here, on the
// server, for admin tasks (invites, account deletion) and non-personal shared caches.

/** Server client acting as the signed-in user (from their auth cookies). */
export async function createUserClient(): Promise<SupabaseClient> {
  const { url, publishableKey } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; the proxy refreshes sessions.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
/** Secret-key client. Bypasses RLS — only for admin operations and shared non-personal tables. */
export function adminClient(): SupabaseClient {
  const { url, secretKey } = supabaseEnv();
  if (!secretKey) throw new HttpError(503, "The server isn’t fully configured: SUPABASE_SECRET_KEY is not set.");
  admin ??= createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function siteUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || vercel || "http://127.0.0.1:3000").replace(/\/$/, "");
}
