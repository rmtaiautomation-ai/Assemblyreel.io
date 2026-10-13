-- Read-only SQL-editor verification AFTER the atomic account test bundle.
-- Raises on known grant/RLS drift; does not create users or read customer rows.
do $$
declare relation text; signature text;
begin
  foreach relation in array array['users','workspaces','video_projects','scenes','media',
    'private_assets','render_artifacts','account_onboarding','account_request_limits','account_workspace_operations','marketing_leads']
  loop
    if not coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.'||relation)),false)
      then raise exception 'RLS_REQUIRED: %',relation; end if;
    if has_table_privilege('anon','public.'||relation,'SELECT')
      or has_table_privilege('anon','public.'||relation,'INSERT,UPDATE,DELETE')
      or has_any_column_privilege('anon','public.'||relation,'SELECT,INSERT,UPDATE')
      or has_table_privilege('authenticated','public.'||relation,'INSERT,UPDATE,DELETE')
      or has_any_column_privilege('authenticated','public.'||relation,'INSERT,UPDATE')
      then raise exception 'BROWSER_GRANT_DRIFT: %',relation; end if;
  end loop;
  if not has_column_privilege('authenticated','public.users','id','SELECT')
    or not has_column_privilege('authenticated','public.users','email','SELECT')
    or has_column_privilege('authenticated','public.users','credits','SELECT')
    then raise exception 'IDENTITY_COLUMN_GRANT_DRIFT'; end if;
  foreach signature in array array['public.create_owned_workspace(jsonb,uuid)',
    'public.save_account_onboarding(integer,jsonb)','public.complete_account_onboarding(integer)',
    'public.admit_account_request(text)','public.reserve_private_media(uuid,uuid,text,integer,text,text)']
  loop
    if not has_function_privilege('authenticated',signature,'EXECUTE')
      or has_function_privilege('anon',signature,'EXECUTE')
      then raise exception 'RPC_GRANT_DRIFT: %',signature; end if;
  end loop;
  if has_function_privilege('authenticated','public.finish_private_media(uuid,uuid,text,boolean)','EXECUTE')
    or has_function_privilege('anon','public.finish_private_media(uuid,uuid,text,boolean)','EXECUTE')
    then raise exception 'PRIVILEGED_RPC_GRANT_DRIFT'; end if;
  if exists(select 1 from storage.buckets where public)
    or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='auth_only_quarantine' and permissive='RESTRICTIVE' and qual='false' and with_check='false')
    then raise exception 'PRIVATE_STORAGE_BOUNDARY_REQUIRED'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='on_auth_user_created' and tgenabled='O')
    then raise exception 'IDENTITY_TRIGGER_REQUIRED'; end if;
end $$;
select 'PASS: installed account/setup database boundaries; real Auth/email/browser tests still required' as result;
