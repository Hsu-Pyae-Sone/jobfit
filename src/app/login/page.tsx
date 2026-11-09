import type { Metadata } from "next";
import { AuthCard, LoginForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/server/auth";
import { signupsAllowed, supabaseConfigured } from "@/lib/server/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  if (!supabaseConfigured()) {
    return (
      <AuthCard title="Sign-in isn’t set up yet">
        <p className="text-sm text-muted">
          This server has no Supabase project configured. Add the Supabase environment variables (see the README section “Deploying the private beta”)
          and restart the server.
        </p>
      </AuthCard>
    );
  }
  return <LoginForm next={safeNext(one(sp.next))} initialError={one(sp.error)?.slice(0, 300) ?? null} signupsAllowed={signupsAllowed()} />;
}
