-- After auth 001–007 AND the six reviewed add-billing-* drafts (see guide).
begin;
create function public.enroll_personal_billing(p_actor_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare account public.billing_accounts;
begin
  if not exists(select 1 from auth.users u join public.users p on p.id=u.id
    where u.id=p_actor_id and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<clock_timestamp())) then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text,0));
  select * into account from public.billing_accounts where user_id=p_actor_id for update;
  if found then
    if account.stripe_mode<>'test' then raise exception 'PLAN_NOT_CONFIGURED'; end if;
    return account.id;
  end if;
  -- Enabled permits approved test checkout; it does NOT grant a subscription or quota.
  insert into public.billing_accounts(user_id,enabled,stripe_mode) values(p_actor_id,true,'test') returning * into account;
  return account.id;
end $$;
revoke all on function public.enroll_personal_billing(uuid) from public,anon,authenticated,service_role;
grant execute on function public.enroll_personal_billing(uuid) to service_role;
grant usage on schema auth to service_role;
grant select(id,email_confirmed_at,is_anonymous,banned_until) on auth.users to service_role;
grant select on public.users,public.workspaces,public.video_projects,public.scenes,public.media to service_role;

-- Preserve receipts and make scheduler retries bounded/backed off.
alter table public.billing_webhook_events add column next_retry_at timestamptz not null default now();
create function public.finish_sandbox_checkout(p_account_id uuid,p_attempt_id uuid,p_session_id text,p_state text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_state not in ('complete','expired') then raise exception 'INVALID_REQUEST'; end if;
  perform 1 from public.billing_accounts where id=p_account_id and stripe_mode='test' for update;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  update public.billing_checkout_attempts set state=p_state,updated_at=clock_timestamp()
    where id=p_attempt_id and account_id=p_account_id and stripe_mode='test' and stripe_session_id=p_session_id
      and (state in ('ready','unknown') or state=p_state);
  if not found then raise exception 'OPERATION_CONFLICT'; end if;
end $$;
revoke all on function public.finish_sandbox_checkout(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_sandbox_checkout(uuid,uuid,text,text) to service_role;
commit;
