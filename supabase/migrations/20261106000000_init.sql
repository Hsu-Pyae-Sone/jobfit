-- Jobfit — initial schema for the private beta.
--
-- Every table that holds personal data has a user_id column and row-level security that
-- limits every operation to the signed-in user's own rows. The server talks to the
-- database with the user's own session for all personal data, so these policies are the
-- actual boundary between accounts. Deleting an auth user cascades to all their rows.

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- ---------------------------------------------------------------- profiles (master career profile)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default '',
  master_resume text not null default '',
  master_resume_confirmed boolean not null default false,
  master_extra jsonb not null default '{}'::jsonb,
  ai_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- per-user documents
create table public.workspaces (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_user_updated on public.workspaces (user_id, updated_at desc);

create table public.matches (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index matches_user_updated on public.matches (user_id, updated_at desc);

create table public.tracker_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index tracker_user_updated on public.tracker_entries (user_id, updated_at desc);

create table public.library_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('resume', 'cover_letter')),
  category text not null check (category in ('template', 'application')),
  title text not null check (char_length(title) between 1 and 200),
  workspace_id uuid,
  tracker_id uuid,
  content text not null check (char_length(content) <= 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_user on public.library_items (user_id, created_at desc);

-- Per-user settings (match weights, tracker statuses, preferences)
create table public.user_kv (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

-- Jobs the user has seen in searches (so details, matching and tracking can refer to them)
create table public.jobs_seen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id text not null,
  data jsonb not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index jobs_seen_recent on public.jobs_seen (user_id, seen_at desc);

-- Reusable AI results (avoids paying twice for identical requests)
create table public.ai_cache (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- AI calls per user per day (cost protection for the beta)
create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- Original uploaded files (stored in the private "uploads" bucket under <user_id>/...)
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,
  file_name text not null,
  mime text not null,
  size integer not null check (size >= 0),
  purpose text not null default 'document',
  created_at timestamptz not null default now()
);
create index uploads_user on public.uploads (user_id, created_at desc);

-- ---------------------------------------------------------------- shared, server-only tables
-- Public job-listing API responses (no personal data) and source usage counters.
-- RLS is enabled with no policies, so only the server's secret key can use them.
create table public.job_cache (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create table public.app_counters (
  key text primary key,
  value integer not null default 0
);

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.matches enable row level security;
alter table public.tracker_entries enable row level security;
alter table public.library_items enable row level security;
alter table public.user_kv enable row level security;
alter table public.jobs_seen enable row level security;
alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;
alter table public.uploads enable row level security;
alter table public.job_cache enable row level security;
alter table public.app_counters enable row level security;

-- Signed-out (anon) requests get no access at all to personal or server-only tables;
-- RLS below then limits signed-in users to their own rows.
revoke all on public.profiles, public.workspaces, public.matches, public.tracker_entries, public.library_items,
  public.user_kv, public.jobs_seen, public.ai_cache, public.ai_usage, public.uploads, public.job_cache, public.app_counters
from anon;

create policy "profiles: read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: create own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'matches', 'tracker_entries', 'library_items', 'user_kv', 'jobs_seen', 'ai_cache', 'ai_usage', 'uploads'] loop
    execute format(
      'create policy "%1$s: own rows" on public.%1$I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------- template limit (defence in depth)
create function public.enforce_template_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'template' and (
    select count(*) from public.library_items
    where user_id = new.user_id and kind = new.kind and category = 'template' and id <> new.id
  ) >= 3 then
    raise exception 'TEMPLATE_LIMIT: at most 3 % templates per user', new.kind using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger library_template_limit before insert or update of category, kind on public.library_items
for each row execute function public.enforce_template_limit();

-- ---------------------------------------------------------------- profile row for every new account
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
-- Accounts created before this migration ran.
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- Atomic per-user daily AI call counter (runs as the caller, so RLS applies).
create function public.increment_ai_usage() returns integer
language sql
set search_path = ''
as $$
  insert into public.ai_usage (user_id, day, count) values ((select auth.uid()), current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;
revoke execute on function public.increment_ai_usage() from anon;

-- ---------------------------------------------------------------- private file storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 4194304)
on conflict (id) do nothing;

create policy "uploads: read own" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- Data API access
-- Newer Supabase projects can be created without automatic grants on new tables, which
-- hides them from the API entirely. Grant explicitly: signed-in users reach personal tables
-- (RLS above still limits them to their own rows); only the server's secret key
-- (service_role) reaches the shared caches. anon gets nothing.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.workspaces, public.matches, public.tracker_entries,
  public.library_items, public.user_kv, public.jobs_seen, public.ai_cache, public.ai_usage, public.uploads
to authenticated;
grant select, insert, update, delete on public.profiles, public.workspaces, public.matches, public.tracker_entries,
  public.library_items, public.user_kv, public.jobs_seen, public.ai_cache, public.ai_usage, public.uploads,
  public.job_cache, public.app_counters
to service_role;
grant execute on function public.increment_ai_usage() to authenticated;

-- Make the Data API pick up the new tables immediately.
notify pgrst, 'reload schema';
