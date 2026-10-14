-- AFTER the guarded ownership upgrade. Run the whole file as postgres.
-- Two synthetic confirmed identities, no password, session, email or Storage bytes.
-- Every inserted record and changed value is rolled back. Never COMMIT this test.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
  if current_user<>'postgres' or to_regnamespace('account_ownership_backup_20261014') is null or
    to_regprocedure('public.create_owned_project(jsonb,uuid)') is null then raise exception 'OWNERSHIP_UPGRADE_REQUIRED'; end if;
  if exists(select 1 from auth.users where id in ('f1111111-1111-4111-8111-111111111111','f2222222-2222-4222-8222-222222222222')
    or email in ('owned-isolation-a@example.invalid','owned-isolation-b@example.invalid')) or
    exists(select 1 from public.workspaces where id in ('fa111111-1111-4111-8111-111111111111','fa222222-2222-4222-8222-222222222222')) or
    exists(select 1 from public.video_projects where id in ('fb111111-1111-4111-8111-111111111111','fb222222-2222-4222-8222-222222222222')) then raise exception 'TEST_COLLISION'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('f1111111-1111-4111-8111-111111111111','owned-isolation-a@example.invalid',now(),false),
  ('f2222222-2222-4222-8222-222222222222','owned-isolation-b@example.invalid',now(),false);

set local request.jwt.claim.sub='f1111111-1111-4111-8111-111111111111';
set local request.jwt.claims='{"sub":"f1111111-1111-4111-8111-111111111111","is_anonymous":false}';
set local role authenticated;
do $$begin
  perform public.create_owned_workspace('{"name":"Fixture A","content_theme":"Rollback only"}', 'fa111111-1111-4111-8111-111111111111');
  perform public.create_owned_workspace('{"name":"Fixture A","content_theme":"Rollback only"}', 'fa111111-1111-4111-8111-111111111111');
  perform public.create_owned_project('{"workspace_id":"fa111111-1111-4111-8111-111111111111","topic":"Fixture A"}', 'fb111111-1111-4111-8111-111111111111');
end $$;
reset role;
set local request.jwt.claim.sub='f2222222-2222-4222-8222-222222222222';
set local request.jwt.claims='{"sub":"f2222222-2222-4222-8222-222222222222","is_anonymous":false}';
set local role authenticated;
do $$begin
  perform public.create_owned_workspace('{"name":"Fixture B","content_theme":"Rollback only"}', 'fa222222-2222-4222-8222-222222222222');
  perform public.create_owned_project('{"workspace_id":"fa222222-2222-4222-8222-222222222222","topic":"Fixture B"}', 'fb222222-2222-4222-8222-222222222222');
  begin
    perform public.create_owned_project('{"workspace_id":"fa111111-1111-4111-8111-111111111111","topic":"Forged"}', 'fb333333-3333-4333-8333-333333333333');
    raise exception 'CROSS_ACCOUNT_PROJECT_CREATED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
  begin
    perform public.rename_owned_resource('workspace','fa111111-1111-4111-8111-111111111111','Forged');
    raise exception 'CROSS_ACCOUNT_RENAME_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
end $$;
reset role;

-- Populate metadata children as the operator solely to exercise each RLS boundary.
insert into public.media(id,project_id,media_type,source,status) values
  ('fc111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','audio','upload','ready'),
  ('fc222222-2222-4222-8222-222222222222','fb222222-2222-4222-8222-222222222222','audio','upload','ready');
insert into public.scenes(id,project_id,media_id,sequence_number,voice_over_beat,final_video_prompt) values
  ('fd111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','fc111111-1111-4111-8111-111111111111',1,'Rollback','Rollback'),
  ('fd222222-2222-4222-8222-222222222222','fb222222-2222-4222-8222-222222222222','fc222222-2222-4222-8222-222222222222',1,'Rollback','Rollback');
insert into public.timeline_items(id,project_id,media_id,track_id,duration) values
  ('fe111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','fc111111-1111-4111-8111-111111111111','A1',1),
  ('fe222222-2222-4222-8222-222222222222','fb222222-2222-4222-8222-222222222222','fc222222-2222-4222-8222-222222222222','A1',1);
insert into public.overlay_clips(id,project_id,text) values
  ('ff111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','Rollback'),
  ('ff222222-2222-4222-8222-222222222222','fb222222-2222-4222-8222-222222222222','Rollback');
insert into public.act_narrations(id,project_id,act_number,audio_url,duration_seconds) values
  ('ab111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111',1,'/test/rollback.wav',1),
  ('ab222222-2222-4222-8222-222222222222','fb222222-2222-4222-8222-222222222222',1,'/test/rollback.wav',1);
insert into public.channel_facts(id,workspace_id,kind,label) values
  ('ac111111-1111-4111-8111-111111111111','fa111111-1111-4111-8111-111111111111','person','Rollback A'),
  ('ac222222-2222-4222-8222-222222222222','fa222222-2222-4222-8222-222222222222','person','Rollback B');
do $$begin
  begin
    insert into public.scenes(id,project_id,media_id,sequence_number,voice_over_beat,final_video_prompt) values
      ('fd333333-3333-4333-8333-333333333333','fb111111-1111-4111-8111-111111111111','fc222222-2222-4222-8222-222222222222',2,'Forged','Forged');
    raise exception 'CROSS_PROJECT_MEDIA_ALLOWED';
  exception when foreign_key_violation then null; end;
end $$;

set local request.jwt.claim.sub='f1111111-1111-4111-8111-111111111111';
set local request.jwt.claims='{"sub":"f1111111-1111-4111-8111-111111111111","is_anonymous":false}';
set local role authenticated;
do $$declare resource text; visible integer; begin
  foreach resource in array array['workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts'] loop
    execute format('select count(*) from public.%I',resource) into visible;
    if visible<>1 then raise exception 'ACCOUNT_A_READ_ISOLATION_FAILED: %',resource; end if;
    begin
      execute format('delete from public.%I where false',resource);
      raise exception 'DIRECT_DELETE_ALLOWED: %',resource;
    exception when insufficient_privilege then null; end;
    begin
      execute format('update public.%I set id=id where false',resource);
      raise exception 'DIRECT_UPDATE_ALLOWED: %',resource;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    update public.workspaces set user_id='f2222222-2222-4222-8222-222222222222';
    raise exception 'OWNER_FORGERY_ALLOWED';
  exception when insufficient_privilege then null; end;
  if has_schema_privilege(current_user,'account_ownership_backup_20261014','USAGE') then raise exception 'BACKUP_EXPOSED'; end if;
  if exists(select 1 from storage.objects) then raise exception 'STORAGE_READ_ALLOWED'; end if;
  begin perform credits from public.users; raise exception 'CREDIT_READ_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='f2222222-2222-4222-8222-222222222222';
set local request.jwt.claims='{"sub":"f2222222-2222-4222-8222-222222222222","is_anonymous":false}';
set local role authenticated;
do $$declare resource text; visible integer; begin
  foreach resource in array array['workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts'] loop
    execute format('select count(*) from public.%I',resource) into visible;
    if visible<>1 then raise exception 'ACCOUNT_B_READ_ISOLATION_FAILED: %',resource; end if;
  end loop;
  if exists(select 1 from public.workspaces where id='fa111111-1111-4111-8111-111111111111') then raise exception 'ACCOUNT_B_READ_ACCOUNT_A'; end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"f2222222-2222-4222-8222-222222222222","is_anonymous":true}';
set local role authenticated;
do $$begin if exists(select 1 from public.workspaces) then raise exception 'ANONYMOUS_IDENTITY_READ_ALLOWED'; end if; end $$;
reset role;
set local role anon;
do $$begin
  begin perform id from public.workspaces; raise exception 'SIGNED_OUT_READ_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: A/B owned metadata isolation, bounded RPCs, same-project links, closed direct writes/credits/storage; all test records rolled back' as result;
