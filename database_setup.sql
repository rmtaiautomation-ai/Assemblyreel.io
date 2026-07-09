-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create Users table (Utility)
create table if not exists public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text unique not null,
  credits integer default 100 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Workspaces table (The "Master" Data)
create table if not exists public.workspaces (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  name text not null, -- e.g., "Biblical Battles"
  linked_accounts jsonb, -- e.g., YouTube/TikTok statuses
  content_theme text not null,
  narration_voice_id text,
  visual_aesthetic text default 'Cinematic',
  aspect_ratio text default '16:9',
  video_language text default 'en',
  duration_pref text default '60-90s',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Video Projects table (Improved youtube_content)
create table if not exists public.video_projects (
  id uuid default uuid_generate_v4() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  topic text not null,
  narrative_arc text,
  story_hook text,
  visual_aesthetic text, -- inherited from workspace but can override
  perspective text, -- generic replacement for battle side
  status text default 'Drafting', -- Drafting, Done, Scheduled
  master_script text,
  platform_metadata jsonb, -- Title, Description, Tags for different platforms
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create Scenes table
create table if not exists public.scenes (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,
  sequence_number integer not null,
  video_duration numeric, -- in seconds
  voice_over_beat text,
  final_video_prompt text,
  generation_status text default 'Pending API',
  video_url text,
  audio_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_update timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.video_projects enable row level security;
alter table public.scenes enable row level security;

-- Create Policies

-- Users
create policy "Users can view own profile." on public.users for select using (auth.uid() = id);
create policy "Users can update own profile." on public.users for update using (auth.uid() = id);

-- Workspaces
create policy "Users can view own workspaces." on public.workspaces for select using (auth.uid() = user_id);
create policy "Users can insert own workspaces." on public.workspaces for insert with check (auth.uid() = user_id);
create policy "Users can update own workspaces." on public.workspaces for update using (auth.uid() = user_id);
create policy "Users can delete own workspaces." on public.workspaces for delete using (auth.uid() = user_id);

-- Video Projects
create policy "Users can view own projects." on public.video_projects for select using (
  auth.uid() = (select user_id from public.workspaces where id = workspace_id)
);
create policy "Users can insert own projects." on public.video_projects for insert with check (
  auth.uid() = (select user_id from public.workspaces where id = workspace_id)
);
create policy "Users can update own projects." on public.video_projects for update using (
  auth.uid() = (select user_id from public.workspaces where id = workspace_id)
);
create policy "Users can delete own projects." on public.video_projects for delete using (
  auth.uid() = (select user_id from public.workspaces where id = workspace_id)
);

-- Scenes
create policy "Users can view own scenes." on public.scenes for select using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can insert own scenes." on public.scenes for insert with check (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can update own scenes." on public.scenes for update using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can delete own scenes." on public.scenes for delete using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);

-- Trigger to automatically create a public.users row when a new auth.users signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists (in case you re-run this)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger to update 'updated_at' or 'last_update' timestamps
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger set_workspaces_updated_at
  before update on public.workspaces
  for each row execute procedure public.set_updated_at();

create trigger set_video_projects_updated_at
  before update on public.video_projects
  for each row execute procedure public.set_updated_at();

create or replace function public.set_scenes_last_update()
returns trigger as $$
begin
  new.last_update = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger set_scenes_last_update
  before update on public.scenes
  for each row execute procedure public.set_scenes_last_update();
