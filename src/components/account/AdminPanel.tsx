"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Skeleton from "@mui/material/Skeleton";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MailPlus, RefreshCw, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Input, Label } from "../ui";
import { useAccount } from "./AccountProvider";

interface AdminUser {
  id: string;
  email: string;
  status: "invited" | "active";
  invitedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  isAdmin: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function AdminPanel() {
  const { me } = useAccount();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [max, setMax] = useState(10);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ users: AdminUser[]; maxUsers: number }>("/api/admin/users");
    setUsers(r.users);
    setMax(r.maxUsers);
  }, []);

  useEffect(() => {
    if (!me?.user.isAdmin || me.mode !== "supabase") return;
    api<{ users: AdminUser[]; maxUsers: number }>("/api/admin/users")
      .then((r) => {
        setUsers(r.users);
        setMax(r.maxUsers);
      })
      .catch((e) => setMsg({ kind: "error", text: errorMessage(e) }));
  }, [me]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy("invite");
    setMsg(null);
    try {
      await api("/api/admin/users", { body: { email } });
      setMsg({ kind: "success", text: `Invitation sent to ${email.trim().toLowerCase()}.` });
      setEmail("");
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function resend(u: AdminUser) {
    setBusy(`resend:${u.id}`);
    setMsg(null);
    try {
      await api(`/api/admin/users/${u.id}`, { body: { action: "resend" } });
      setMsg({ kind: "success", text: u.status === "invited" ? `A new invitation was sent to ${u.email}.` : `A password-reset link was sent to ${u.email}.` });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(`remove:${removing.id}`);
    setMsg(null);
    try {
      await api(`/api/admin/users/${removing.id}`, { method: "DELETE" });
      setMsg({ kind: "success", text: `${removing.email} and all of their data were deleted.` });
      setRemoving(null);
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  if (me && (!me.user.isAdmin || me.mode !== "supabase")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Alert kind="info" title="Admin isn’t available">
          {me.mode !== "supabase" ? "Invitations need a Supabase project. Local mode has a single user." : "Only admins can manage invitations."}
        </Alert>
      </div>
    );
  }

  const full = users ? users.length >= max : false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Admin</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Private beta access</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Jobfit is invite-only. Invited people get an email with a link to choose their password. Each account’s data is private; admins can’t see it.
      </p>

      {msg && (
        <Alert kind={msg.kind} className="mt-5">
          {msg.text}
        </Alert>
      )}

      <Card className="mt-6 p-5 sm:p-6">
        <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">Invite by email</Label>
            <Input id="invite-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          </div>
          <Button type="submit" variant="primary" loading={busy === "invite"} disabled={!email.trim() || full} icon={<MailPlus className="size-4" />}>
            Send invitation
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">
          {users ? `${users.length} of ${max} beta accounts used.` : " "} Supabase’s built-in email sender allows only a few emails per hour; see the README to
          use your own SMTP.
        </p>
      </Card>

      <Card className="mt-5 overflow-hidden">
        {!users ? (
          <div className="p-5">
            <Skeleton variant="rounded" height={120} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.email} {u.isAdmin && <Badge tone="brand">Admin</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    {u.status === "invited" ? `Invited ${fmt(u.invitedAt)} · hasn’t signed in yet` : `Last sign-in ${fmt(u.lastSignInAt)}`}
                  </p>
                </div>
                <Badge tone={u.status === "active" ? "add" : "warn"}>{u.status === "active" ? "Active" : "Invited"}</Badge>
                <Button size="sm" variant="ghost" onClick={() => resend(u)} loading={busy === `resend:${u.id}`} icon={<RefreshCw className="size-3.5" />}>
                  {u.status === "invited" ? "Resend invite" : "Send reset link"}
                </Button>
                {u.email !== me?.user.email && (
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(u)} icon={<Trash2 className="size-3.5" />} aria-label={`Remove ${u.email}`}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} maxWidth="xs" fullWidth aria-labelledby="remove-user-title">
        <DialogTitle id="remove-user-title">Remove {removing?.email}?</DialogTitle>
        <DialogContent>
          <p className="text-sm text-ink-2">
            Their account, profile, applications, saved documents and uploaded files are permanently deleted. This can’t be undone. Ask them to export their data
            first (Settings → Your data) if they want to keep it.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" onClick={remove} loading={busy?.startsWith("remove:")}>
            Delete account
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
