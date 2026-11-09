// Environment helpers shared by the proxy and server code (no Next request APIs here).

export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

export function supabaseConfigured(): boolean {
  const e = supabaseEnv();
  return Boolean(e.url && e.publishableKey);
}

/** Local single-user mode: only without Supabase, and only in development/tests or when explicitly enabled. */
export function localModeAllowed(): boolean {
  return !supabaseConfigured() && (process.env.NODE_ENV !== "production" || process.env.CAREERFIT_LOCAL_MODE === "1");
}

/** Public sign-up is off for the private beta; accounts are created by admin invitation. */
export function signupsAllowed(): boolean {
  return process.env.ALLOW_SIGNUPS === "1";
}
