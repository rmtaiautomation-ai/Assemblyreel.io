-- AFTER 008-owned-draft-editor.sql. Run the WHOLE file as postgres.
-- Synthetic confirmed identities and metadata only. Every change is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
  if current_user<>'postgres' or to_regprocedure('public.save_owned_editor(uuid,integer,uuid,jsonb)') is null then raise exception 'EDITOR_UPGRADE_REQUIRED'; end if;
  if exists(select 1 from auth.users where id in ('f5555555-5555-4555-8555-555555555555','f6666666-6666-4666-8666-666666666666')
    or email in ('editor-a@example.invalid','editor-b@example.invalid'))
    or exists(select 1 from public.workspaces where id in ('fa555555-5555-4555-8555-555555555555','fa666666-6666-4666-8666-666666666666'))
    or exists(select 1 from public.video_projects where id in ('fb555555-5555-4555-8555-555555555555','fb666666-6666-4666-8666-666666666666'))
    or exists(select 1 from public.scenes where id='fd555555-5555-4555-8555-555555555555')
    or exists(select 1 from public.media where id in ('fc555555-5555-4555-8555-555555555555','fc666666-6666-4666-8666-666666666666'))
    or exists(select 1 from public.timeline_items where id='fe555555-5555-4555-8555-555555555555')
    or exists(select 1 from public.account_editor_operations where id in ('ff555555-5555-4555-8555-555555555555','ff666666-6666-4666-8666-666666666666')) then raise exception 'TEST_COLLISION'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('f5555555-5555-4555-8555-555555555555','editor-a@example.invalid',now(),false),
  ('f6666666-6666-4666-8666-666666666666','editor-b@example.invalid',now(),false);
set local request.jwt.claim.sub='f5555555-5555-4555-8555-555555555555';
set local request.jwt.claims='{"sub":"f5555555-5555-4555-8555-555555555555","is_anonymous":false}';
set local role authenticated;
select public.create_owned_workspace('{"name":"Editor fixture A","content_theme":"Rollback"}','fa555555-5555-4555-8555-555555555555');
select public.create_owned_project('{"workspace_id":"fa555555-5555-4555-8555-555555555555","topic":"Rollback A"}','fb555555-5555-4555-8555-555555555555');
reset role;
set local request.jwt.claim.sub='f6666666-6666-4666-8666-666666666666';
set local request.jwt.claims='{"sub":"f6666666-6666-4666-8666-666666666666","is_anonymous":false}';
set local role authenticated;
select public.create_owned_workspace('{"name":"Editor fixture B","content_theme":"Rollback"}','fa666666-6666-4666-8666-666666666666');
select public.create_owned_project('{"workspace_id":"fa666666-6666-4666-8666-666666666666","topic":"Rollback B"}','fb666666-6666-4666-8666-666666666666');
reset role;
insert into public.media(id,project_id,media_type,source,status,duration_seconds) values
  ('fc555555-5555-4555-8555-555555555555','fb555555-5555-4555-8555-555555555555','audio','upload','ready',20),
  ('fc666666-6666-4666-8666-666666666666','fb666666-6666-4666-8666-666666666666','audio','upload','ready',20);

set local request.jwt.claim.sub='f5555555-5555-4555-8555-555555555555';
set local request.jwt.claims='{"sub":"f5555555-5555-4555-8555-555555555555","is_anonymous":false}';
set local role authenticated;
do $$declare doc jsonb; first_save jsonb; next_save jsonb; begin
  doc:=public.read_owned_editor('fb555555-5555-4555-8555-555555555555')->'document';
  doc:=jsonb_set(doc,'{scenes}','[{"id":"fd555555-5555-4555-8555-555555555555","voice_over_beat":"Rollback narration","final_video_prompt":"Rollback description","video_duration":5,"trim_start":0}]');
  doc:=jsonb_set(doc,'{items}','[{"id":"fe555555-5555-4555-8555-555555555555","media_id":"fc555555-5555-4555-8555-555555555555","track_id":"A1","start_time":0,"duration":5,"trim_start":0}]');
  doc:=jsonb_set(doc,'{settings,captions_enabled}','true');
  first_save:=public.save_owned_editor('fb555555-5555-4555-8555-555555555555',0,'ff555555-5555-4555-8555-555555555555',doc);
  next_save:=public.save_owned_editor('fb555555-5555-4555-8555-555555555555',0,'ff555555-5555-4555-8555-555555555555',doc);
  if first_save is distinct from next_save or (first_save->>'revision')::integer is distinct from 1
    or (public.read_owned_editor('fb555555-5555-4555-8555-555555555555')->'document') is distinct from doc then raise exception 'EDITOR_SAVE_OR_REPLAY_FAILED'; end if;
  begin
    perform public.save_owned_editor('fb555555-5555-4555-8555-555555555555',0,'ff555555-5555-4555-8555-555555555555',jsonb_set(doc,'{scenes,0,voice_over_beat}','"Changed"'));
    raise exception 'CHANGED_RETRY_ALLOWED';
  exception when raise_exception then if sqlerrm<>'OPERATION_REUSED' then raise; end if; end;
  begin
    perform public.save_owned_editor('fb555555-5555-4555-8555-555555555555',0,'ff666666-6666-4666-8666-666666666666',doc);
    raise exception 'STALE_REVISION_ALLOWED';
  exception when raise_exception then if sqlerrm<>'EDITOR_CONFLICT' then raise; end if; end;
  begin
    perform public.save_owned_editor('fb555555-5555-4555-8555-555555555555',1,'ff666666-6666-4666-8666-666666666666',jsonb_set(doc,'{items,0,media_id}','"fc666666-6666-4666-8666-666666666666"'));
    raise exception 'FOREIGN_MEDIA_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
  begin perform public.read_owned_editor('fb666666-6666-4666-8666-666666666666');raise exception 'FOREIGN_READ_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
  begin update public.scenes set voice_over_beat='Forged' where false;raise exception 'DIRECT_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
  begin perform id from public.account_editor_operations;raise exception 'OPERATIONS_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='f6666666-6666-4666-8666-666666666666';
set local request.jwt.claims='{"sub":"f6666666-6666-4666-8666-666666666666","is_anonymous":false}';
set local role authenticated;
do $$declare doc jsonb; begin
  begin perform public.read_owned_editor('fb555555-5555-4555-8555-555555555555');raise exception 'REVERSE_READ_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
  doc:=public.read_owned_editor('fb666666-6666-4666-8666-666666666666')->'document';
  begin perform public.save_owned_editor('fb555555-5555-4555-8555-555555555555',1,'ff666666-6666-4666-8666-666666666666',doc);raise exception 'FOREIGN_SAVE_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
  doc:=jsonb_set(doc,'{scenes}','[{"id":"fd555555-5555-4555-8555-555555555555","voice_over_beat":"Forged","final_video_prompt":"Forged","video_duration":5,"trim_start":0}]');
  begin perform public.save_owned_editor('fb666666-6666-4666-8666-666666666666',0,'ff666666-6666-4666-8666-666666666666',doc);raise exception 'FOREIGN_SCENE_ALLOWED';
  exception when raise_exception then if sqlerrm<>'RESOURCE_UNAVAILABLE' then raise; end if; end;
end $$;
reset role;
do $$begin
  if (select account_editor_revision from public.video_projects where id='fb555555-5555-4555-8555-555555555555') is distinct from 1
    or (select count(*) from public.account_editor_operations where project_id='fb555555-5555-4555-8555-555555555555')<>1
    or (select hits from public.account_request_limits where actor_id='f5555555-5555-4555-8555-555555555555' and action='editor') is distinct from 1 then raise exception 'EDITOR_COUNT_FAILED'; end if;
end $$;
set local request.jwt.claims='{"sub":"f6666666-6666-4666-8666-666666666666","is_anonymous":true}';
set local role authenticated;
do $$begin
  begin perform public.read_owned_editor('fb666666-6666-4666-8666-666666666666');raise exception 'ANONYMOUS_READ_ALLOWED';
  exception when raise_exception then if sqlerrm<>'AUTH_REQUIRED' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$begin
  begin perform public.read_owned_editor('fb666666-6666-4666-8666-666666666666');raise exception 'SIGNED_OUT_READ_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: owned editor save/replay/conflict/isolation and direct-write boundaries; all fixture changes rolled back' as result;
