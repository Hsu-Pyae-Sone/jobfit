// Applies the real Supabase migration to an in-process Postgres (PGlite) with stubs for
// Supabase's auth/storage schemas, then checks that row-level security isolates users.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
`;

// Storage's own grants. Public tables get none here: like a Supabase project created with
// "automatically expose new tables" off, the migration's explicit grants must be enough.
const GRANTS = `
grant select, insert, update, delete on storage.objects to authenticated;
`;

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(user ? `set role authenticated; set request.jwt.claim.sub = '${user}';` : `set role anon; set request.jwt.claim.sub = '';`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.exec(GRANTS);
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');`);
}, 60000);

describe("database row-level security", () => {
  it("creates a profile for every new account", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.profiles");
    expect(r.rows[0].n).toBe(2);
  });

  it("users only see and edit their own profile", async () => {
    const rows = await as(A, () => db.query<{ email: string }>("select email from public.profiles"));
    expect(rows.rows.map((r) => r.email)).toEqual(["a@example.com"]);
    const upd = await as(A, () => db.query(`update public.profiles set display_name = 'hacked' where id = '${B}'`));
    expect(upd.affectedRows).toBe(0);
  });

  it("a missing profile row can be recreated only for yourself", async () => {
    await db.exec(`delete from public.profiles where id = '${A}'`);
    await expect(as(A, () => db.query(`insert into public.profiles (id) values ('${B}') on conflict (id) do update set display_name = 'x'`))).rejects.toThrow(/row-level security/);
    await as(A, () => db.query(`insert into public.profiles (id, ai_consent_at) values ('${A}', now()) on conflict (id) do update set ai_consent_at = excluded.ai_consent_at`));
    const r = await as(A, () => db.query<{ ok: boolean }>("select ai_consent_at is not null as ok from public.profiles"));
    expect(r.rows).toEqual([{ ok: true }]);
    await db.exec(`update public.profiles set email = 'a@example.com' where id = '${A}'`);
  });

  it("isolates workspaces between accounts", async () => {
    await as(A, () => db.query(`insert into public.workspaces (id, title, data) values (gen_random_uuid(), 'A private', '{}')`));
    const bSees = await as(B, () => db.query("select * from public.workspaces"));
    expect(bSees.rows).toHaveLength(0);
    const aSees = await as(A, () => db.query("select title from public.workspaces"));
    expect(aSees.rows).toHaveLength(1);
    // B can't write rows owned by A, or delete A's rows
    await expect(as(B, () => db.query(`insert into public.workspaces (id, user_id, title, data) values (gen_random_uuid(), '${A}', 'x', '{}')`))).rejects.toThrow(/row-level security/);
    const del = await as(B, () => db.query("delete from public.workspaces"));
    expect(del.affectedRows).toBe(0);
  });

  it("anonymous requests are refused", async () => {
    await expect(as(null, () => db.query("select * from public.workspaces"))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => db.query("select * from public.profiles"))).rejects.toThrow(/permission denied/);
  });

  it("every personal table is protected", async () => {
    const r = await db.query<{ tablename: string; rowsecurity: boolean }>("select tablename, rowsecurity from pg_tables where schemaname = 'public'");
    expect(r.rows.length).toBeGreaterThanOrEqual(12);
    expect(r.rows.filter((t) => !t.rowsecurity)).toEqual([]);
  });

  it("server-only caches are not readable by users", async () => {
    await db.exec(`insert into public.job_cache (key, payload) values ('feed:x', '[]')`);
    await expect(as(A, () => db.query("select * from public.job_cache"))).rejects.toThrow(/permission denied/);
    await expect(as(A, () => db.query("select * from public.app_counters"))).rejects.toThrow(/permission denied/);
  });

  it("enforces at most three templates per kind per user", async () => {
    const add = (user: string, kind: string, n: number) =>
      as(user, () => db.query(`insert into public.library_items (id, kind, category, title, content) values (gen_random_uuid(), '${kind}', 'template', 'T${n}', 'x')`));
    for (let i = 1; i <= 3; i++) await add(A, "resume", i);
    await expect(add(A, "resume", 4)).rejects.toThrow(/TEMPLATE_LIMIT/);
    await add(A, "cover_letter", 1); // separate limit
    await add(B, "resume", 1); // separate user
    await as(A, () => db.query(`insert into public.library_items (id, kind, category, title, content) values (gen_random_uuid(), 'resume', 'application', 'App doc', 'x')`)); // not limited
  });

  it("counts AI usage per user atomically", async () => {
    const one = await as(A, () => db.query<{ increment_ai_usage: number }>("select public.increment_ai_usage()"));
    const two = await as(A, () => db.query<{ increment_ai_usage: number }>("select public.increment_ai_usage()"));
    const b1 = await as(B, () => db.query<{ increment_ai_usage: number }>("select public.increment_ai_usage()"));
    expect([one.rows[0].increment_ai_usage, two.rows[0].increment_ai_usage, b1.rows[0].increment_ai_usage]).toEqual([1, 2, 1]);
  });

  it("storage: users can only touch files in their own folder", async () => {
    await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('uploads', '${A}/resume.pdf')`));
    await expect(as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('uploads', '${B}/evil.pdf')`))).rejects.toThrow(/row-level security/);
    const bSees = await as(B, () => db.query("select * from storage.objects"));
    expect(bSees.rows).toHaveLength(0);
  });

  it("deleting an account removes all of its data", async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    for (const t of ["profiles", "workspaces", "library_items", "ai_usage"]) {
      const col = t === "profiles" ? "id" : "user_id";
      const r = await db.query<{ n: number }>(`select count(*)::int as n from public.${t} where ${col} = '${A}'`);
      expect(r.rows[0].n, t).toBe(0);
    }
  });
});
