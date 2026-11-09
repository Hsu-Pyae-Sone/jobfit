"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Input, Label } from "../ui";

async function post(path: string, body: unknown): Promise<{ ok?: boolean; error?: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) return { error: data.error ?? `Request failed (${res.status}).` };
    return data;
  } catch {
    return { error: "Could not reach the server. Check your connection." };
  }
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-ink text-sm font-bold text-white">JF</span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Job<span className="text-brand">fit</span>
          </span>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

type Mode = "signin" | "forgot" | "signup";

export function LoginForm({ next, initialError, signupsAllowed }: { next: string; initialError: string | null; signupsAllowed: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(initialError);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    // Email links built from Supabase's default templates can arrive here (via a redirect)
    // carrying the session in the URL fragment; finish signing in on the password page.
    const h = window.location.hash;
    if (/access_token=|error_description=/.test(h)) window.location.replace(new URL(`/auth/set-password${h}`, window.location.origin).href);
  }, []);

  function switchTo(m: Mode) {
    setMode(m);
    setErr(null);
    setDone(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setDone(null);
    if (mode === "signin") {
      const r = await post("/auth/login", { email, password });
      if (r.error) {
        setErr(r.error);
        setBusy(false);
        return;
      }
      window.location.href = new URL(next, window.location.origin).href;
      return;
    }
    if (mode === "forgot") {
      const r = await post("/auth/forgot", { email });
      if (r.error) setErr(r.error);
      else setDone("If an account exists for that address, a password-reset link is on its way. Check your inbox (and spam folder).");
    } else {
      const r = await post("/auth/signup", { email, password });
      if (r.error) setErr(r.error);
      else setDone("Check your inbox for a link to confirm your email address.");
    }
    setBusy(false);
  }

  const title = mode === "signin" ? "Sign in" : mode === "forgot" ? "Reset your password" : "Create an account";
  const subtitle =
    mode === "signin"
      ? signupsAllowed
        ? "Welcome back."
        : "Jobfit is invite-only. Use the email address your invitation was sent to."
      : mode === "forgot"
        ? "We’ll email you a link to choose a new password."
        : "You’ll confirm your email address before signing in.";

  return (
    <AuthCard title={title} subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="auth-email">Email</Label>
          <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "forgot" && (
          <div>
            <Label htmlFor="auth-password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {err && <Alert kind="error">{err}</Alert>}
        {done && <Alert kind="success">{done}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || (mode !== "forgot" && !password)}>
          {mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Create account"}
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        {mode === "signin" ? (
          <button type="button" className="text-brand hover:underline" onClick={() => switchTo("forgot")}>
            Forgot password?
          </button>
        ) : (
          <button type="button" className="text-brand hover:underline" onClick={() => switchTo("signin")}>
            Back to sign in
          </button>
        )}
        {signupsAllowed && mode === "signin" && (
          <button type="button" className="text-brand hover:underline" onClick={() => switchTo("signup")}>
            Create an account
          </button>
        )}
      </div>
    </AuthCard>
  );
}

/** After an invite or password-reset link: choose a password (and, for invites, a display name). */
export function SetPasswordForm() {
  const [stage, setStage] = useState<"checking" | "ready" | "invalid">("checking");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase's default templates put the session in the URL fragment. Move it into an
    // httpOnly cookie on the server and remove it from the address bar.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    const hashError = hash.get("error_description");
    if (hashError) {
      window.history.replaceState(null, "", window.location.pathname);
      queueMicrotask(() => {
        setErr(hashError);
        setStage("invalid");
      });
      return;
    }
    if (access && refresh) {
      const type = hash.get("type");
      window.history.replaceState(null, "", window.location.pathname);
      void post("/auth/session", { access_token: access, refresh_token: refresh }).then((r) => {
        if (r.error) setErr(r.error);
        // Email confirmations for an account that already has a password go straight in.
        else if (type === "signup" || type === "magiclink" || type === "email_change") {
          window.location.href = new URL("/", window.location.origin).href;
          return;
        }
        setStage(r.error ? "invalid" : "ready");
      });
      return;
    }
    queueMicrotask(() => setStage("ready"));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErr("The two passwords don’t match.");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await post("/auth/password", { password, displayName: name.trim() || undefined });
    if (r.error) {
      setErr(r.error);
      setBusy(false);
      return;
    }
    window.location.href = new URL("/", window.location.origin).href;
  }

  if (stage === "checking") {
    return (
      <AuthCard title="Choose your password">
        <p className="text-sm text-muted">Checking your link…</p>
      </AuthCard>
    );
  }
  if (stage === "invalid") {
    return (
      <AuthCard title="Link not valid">
        <Alert kind="error">{err ?? "This link has expired or was already used."}</Alert>
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-brand hover:underline">
            Go to sign in
          </Link>{" "}
          and use “Forgot password?” to get a new link, or ask the person who invited you to resend the invitation.
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose your password" subtitle="You’ll use it with your email address to sign in.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="sp-name" hint="Optional">
            Your name
          </Label>
          <Input id="sp-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sp-password" hint="At least 10 characters">
            New password
          </Label>
          <Input id="sp-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sp-confirm">Repeat password</Label>
          <Input id="sp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {err && <Alert kind="error">{err}</Alert>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={password.length < 10 || !confirm}>
          Save password and continue
        </Button>
      </form>
    </AuthCard>
  );
}
