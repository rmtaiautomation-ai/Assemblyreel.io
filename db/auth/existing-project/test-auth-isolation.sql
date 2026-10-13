-- Auth-only acceptance AFTER the existing-project containment upgrade.
-- Run the whole file in Supabase SQL Editor as postgres. Do not run a selection.
-- Synthetic identities have no password or session; no email is sent.
-- All test inserts and trigger-created profiles are rolled back. Never COMMIT.
-- This tests PostgreSQL roles/RLS, not two real browser sessions or email delivery.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $$begin
  if current_user <> 'postgres' then raise exception 'POSTGRES_OPERATOR_REQUIRED'; end if;
  if to_regclass('public.marketing_leads') is null or
     to_regnamespace('account_access_backup_20261013') is null then
    raise exception 'EXISTING_AUTH_UPGRADE_REQUIRED';
  end if;
  if exists(select 1 from auth.users where id in
    ('e1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222')
    or email in ('auth-isolation-a@example.invalid','auth-isolation-b@example.invalid')) or
     exists(select 1 from public.users where id in
    ('e1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222')
    or email in ('auth-isolation-a@example.invalid','auth-isolation-b@example.invalid')) then
    raise exception 'TEST_IDENTITY_COLLISION';
  end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('e1111111-1111-4111-8111-111111111111','auth-isolation-a@example.invalid',now(),false),
  ('e2222222-2222-4222-8222-222222222222','auth-isolation-b@example.invalid',now(),false);
do $$begin
  if (select count(*) from public.users where id in
      ('e1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222') and credits=0) <> 2 then
    raise exception 'ZERO_CREDIT_PROVISIONING_FAILED';
  end if;
end $$;

set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false}';
set local role authenticated;
do $$declare resource text; begin
  if (select count(*) from public.users) <> 1 or not exists(select 1 from public.users
     where id='e1111111-1111-4111-8111-111111111111' and email='auth-isolation-a@example.invalid') then
    raise exception 'ACCOUNT_A_ISOLATION_FAILED';
  end if;
  begin
    update public.users set email='forged@example.invalid';
    raise exception 'PROFILE_WRITE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform credits from public.users;
    raise exception 'CREDIT_READ_ALLOWED';
  exception when insufficient_privilege then null; end;
  foreach resource in array array['workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts','marketing_leads'] loop
    begin
      execute format('select 1 from public.%I limit 1',resource);
      raise exception 'CONTENT_READ_ALLOWED: %',resource;
    exception when insufficient_privilege then null; end;
  end loop;
  if has_schema_privilege(current_user,'account_access_backup_20261013','USAGE') then
    raise exception 'BACKUP_SCHEMA_EXPOSED';
  end if;
  if exists(select 1 from storage.objects) then raise exception 'STORAGE_READ_ALLOWED'; end if;
end $$;
reset role;

set local request.jwt.claim.sub = 'e2222222-2222-4222-8222-222222222222';
set local request.jwt.claims = '{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false}';
set local role authenticated;
do $$begin
  if (select count(*) from public.users) <> 1 or not exists(select 1 from public.users
     where id='e2222222-2222-4222-8222-222222222222' and email='auth-isolation-b@example.invalid') then
    raise exception 'ACCOUNT_B_ISOLATION_FAILED';
  end if;
  if exists(select 1 from public.users where id='e1111111-1111-4111-8111-111111111111') then
    raise exception 'ACCOUNT_B_READ_ACCOUNT_A';
  end if;
end $$;
reset role;
set local request.jwt.claims = '{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":true}';
set local role authenticated;
do $$begin
  if exists(select 1 from public.users) then raise exception 'ANONYMOUS_IDENTITY_READ_ALLOWED'; end if;
end $$;
reset role;
set local role anon;
do $$begin
  begin
    perform id,email from public.users;
    raise exception 'SIGNED_OUT_PROFILE_READ_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: auth-only A/B role isolation, zero-credit provisioning and closed content/storage; test inserts rolled back' as result;
