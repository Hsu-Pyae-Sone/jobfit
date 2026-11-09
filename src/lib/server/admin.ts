import "server-only";
import type { User } from "@supabase/supabase-js";
import { ctx } from "./context";
import { HttpError } from "./errors";
import { adminClient, siteUrl, supabaseConfigured } from "./supabase";

/** Private-beta size. Raise BETA_MAX_USERS to allow more accounts. */
export function betaMaxUsers(): number {
  const n = Number(process.env.BETA_MAX_USERS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

export function requireAdmin(): void {
  const c = ctx();
  if (c.mode !== "supabase") throw new HttpError(400, "Inviting users needs Supabase. Local mode has a single user.");
  if (!c.user.isAdmin) throw new HttpError(403, "Only admins can manage invitations.");
}

export interface AdminUser {
  id: string;
  email: string;
  status: "invited" | "active";
  invitedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  isAdmin: boolean;
}

function toAdminUser(u: User, admins: string[]): AdminUser {
  const email = (u.email ?? "").toLowerCase();
  return {
    id: u.id,
    email,
    status: u.last_sign_in_at || (u.email_confirmed_at && !u.invited_at) ? "active" : "invited",
    invitedAt: u.invited_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
    createdAt: u.created_at,
    isAdmin: admins.includes(email),
  };
}

export async function listUsers(admins: string[]): Promise<AdminUser[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new HttpError(502, `Could not list users: ${error.message}`);
  return data.users.map((u) => toAdminUser(u, admins)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function inviteUser(email: string, admins: string[]): Promise<AdminUser> {
  const users = await listUsers(admins);
  if (users.some((u) => u.email === email)) throw new HttpError(409, "That person already has an account or a pending invitation. Use “Resend” instead.");
  if (users.length >= betaMaxUsers()) {
    throw new HttpError(409, `The private beta is limited to ${betaMaxUsers()} accounts. Remove an account or raise BETA_MAX_USERS.`);
  }
  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/auth/set-password` });
  if (error) {
    if (error.status === 429) throw new HttpError(429, `Supabase refused to send the email right now (${error.message}). Wait a minute and try again; if it keeps happening, check Supabase → Authentication → SMTP Settings and Rate Limits.`);
    throw new HttpError(502, `The invitation could not be sent: ${error.message}`);
  }
  return toAdminUser(data.user, admins);
}

/** Send a fresh link: a new invite if they never signed in, otherwise a password-reset email. */
export async function resendInvite(userId: string, admins: string[]): Promise<void> {
  const user = (await listUsers(admins)).find((u) => u.id === userId);
  if (!user) throw new HttpError(404, "User not found.");
  const admin = adminClient();
  const { error } =
    user.status === "invited"
      ? await admin.auth.admin.inviteUserByEmail(user.email, { redirectTo: `${siteUrl()}/auth/set-password` })
      : await admin.auth.resetPasswordForEmail(user.email, { redirectTo: `${siteUrl()}/auth/set-password` });
  if (error) {
    if (error.status === 429) throw new HttpError(429, `Supabase refused to send the email right now (${error.message}). Wait a minute and try again; if it keeps happening, check Supabase → Authentication → SMTP Settings and Rate Limits.`);
    throw new HttpError(502, `The email could not be sent: ${error.message}`);
  }
}

/** Remove a user's stored files, then the account (all database rows cascade). */
export async function deleteUserCompletely(userId: string): Promise<void> {
  const admin = adminClient();
  const { data: files } = await admin.from("uploads").select("path").eq("user_id", userId);
  const paths = (files ?? []).map((f) => f.path as string);
  // Also catch any objects without a database row.
  const { data: listed } = await admin.storage.from("uploads").list(userId, { limit: 1000 });
  for (const o of listed ?? []) paths.push(`${userId}/${o.name}`);
  const unique = [...new Set(paths)];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from("uploads").remove(unique.slice(i, i + 100));
    if (error) throw new HttpError(502, `Could not delete stored files: ${error.message}`);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(502, `Could not delete the account: ${error.message}`);
}
