import { z } from "zod";
import { betaMaxUsers, inviteUser, listUsers, requireAdmin } from "@/lib/server/admin";
import { handle, json, readJson } from "@/lib/server/http";
import { adminEmails } from "@/lib/server/supabase";

export const GET = handle(async () => {
  requireAdmin();
  return json({ users: await listUsers(adminEmails()), maxUsers: betaMaxUsers() });
});

export const POST = handle(async (req: Request) => {
  requireAdmin();
  const { email } = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320) }).parse(await readJson(req));
  return json({ user: await inviteUser(email, adminEmails()) }, 201);
});
