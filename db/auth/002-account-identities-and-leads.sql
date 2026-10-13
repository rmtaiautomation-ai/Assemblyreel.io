-- Run AFTER 001; inspect existing auth triggers before applying to a live project.
begin;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);
-- Credits are legacy data, never an entitlement. Preserve existing balances.
alter table public.users alter column credits set default 0;
alter table public.users enable row level security;

-- Remove old permissive identity policies, then expose only one's own minimal row.
do $$ declare policy record; begin
  for policy in select policyname from pg_policies where schemaname='public' and tablename='users'
  loop execute format('drop policy %I on public.users', policy.policyname); end loop;
end $$;
revoke all on public.users from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select (id,email) on public.users to authenticated;
create policy account_identity_read on public.users for select to authenticated
  using (id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or new.is_anonymous is true then return new; end if;
  insert into public.users(id,email,credits) values(new.id,new.email,0)
    on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Idempotent, non-destructive backfill; conflicting emails abort for explicit review.
insert into public.users(id,email,credits)
  select id,email,0 from auth.users where email is not null and is_anonymous is not true
  on conflict (id) do nothing;

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 254),
  request_type text not null check (request_type in ('early_access','demo')),
  name text check (length(name) <= 100),
  channel_url text check (length(channel_url) <= 500),
  video_length text check (video_length in ('5-10m','10-20m','20m+')),
  challenge text check (length(challenge) <= 2000),
  updates_consent boolean not null default false,
  consent_version text not null default '2026-10-12',
  created_at timestamptz not null default now()
);
alter table public.marketing_leads enable row level security;
revoke all on public.marketing_leads from public, anon, authenticated;
create index if not exists marketing_leads_email_created on public.marketing_leads(email, created_at);

create or replace function public.record_marketing_lead(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare address text := lower(btrim(payload->>'email'));
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(address, 0));
  if exists (select 1 from public.marketing_leads where email=address and created_at > now()-interval '60 seconds') then
    raise exception 'LEAD_RATE_LIMIT';
  end if;
  insert into public.marketing_leads(email,request_type,name,channel_url,video_length,challenge,updates_consent)
  values(address,payload->>'requestType',nullif(payload->>'name',''),nullif(payload->>'channelUrl',''),
    payload->>'videoLength',nullif(payload->>'challenge',''),coalesce((payload->>'updatesConsent')::boolean,false));
end;
$$;
revoke all on function public.record_marketing_lead(jsonb) from public, anon, authenticated;
grant usage on schema public to service_role;
grant execute on function public.record_marketing_lead(jsonb) to service_role;

commit;
