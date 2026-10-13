-- FRESH, ISOLATED TEST PROJECT ONLY. This is not an existing-project migration.
-- Use the generated atomic bundle so core tables and containment commit together.
begin;
do $$
begin
  if exists(select 1 from auth.users) or exists(select 1 from storage.buckets)
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p'))
    or exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal)
  then raise exception 'EMPTY_TEST_PROJECT_REQUIRED: existing accounts, public tables, buckets or auth triggers found; no changes made'; end if;
end $$;

-- Only the core columns needed by the guarded account/setup/media milestone.
-- No sample users, personal content, trial credits or provider configuration.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  name text not null,
  content_theme text not null,
  linked_accounts jsonb,
  narration_voice_id text,
  visual_aesthetic text,
  aspect_ratio text,
  video_language text,
  duration_pref text,
  created_at timestamptz not null default now()
);
create table public.video_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  topic text not null,
  status text not null default 'drafting',
  created_at timestamptz not null default now()
);
create table public.media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id),
  media_type text,
  source text,
  status text,
  storage_path text,
  url text,
  original_filename text,
  created_at timestamptz not null default now()
);
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id),
  media_id uuid references public.media(id)
);
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.video_projects enable row level security;
alter table public.media enable row level security;
alter table public.scenes enable row level security;
revoke all on public.users,public.workspaces,public.video_projects,public.media,public.scenes from public,anon,authenticated,service_role;
commit;
