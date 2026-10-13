-- After auth 008 and billing foundation. Service RPCs are never browser write permissions.
begin;
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  project_id uuid not null references public.video_projects(id),
  kind text not null check(kind in ('mock_script','script','cloud_render')),
  operation_key uuid not null,
  input jsonb not null check(length(input::text)<=4096),
  input_fingerprint text not null check(input_fingerprint ~ '^[a-f0-9]{64}$'),
  account_id uuid references public.billing_accounts(id),
  billing_operation_id uuid unique,
  state text not null default 'queued' check(state in ('queued','claimed','submitting','awaiting_provider','succeeded','canceled','unknown')),
  claim_token uuid,lease_until timestamptz,
  output text check(octet_length(output)<=32768),
  provider_request_id text check(length(provider_request_id)<=256),
  provider_handle jsonb check(length(provider_handle::text)<=2048),
  error_code text check(error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(actor_id,operation_key),
  foreign key(billing_operation_id,account_id) references public.billing_operations(id,account_id),
  check((kind<>'mock_script')=(billing_operation_id is not null and account_id is not null)),
  check((state='succeeded')=(output is not null))
);
create index generation_jobs_dispatch_idx on public.generation_jobs(state,updated_at);
alter table public.generation_jobs enable row level security;
revoke all on public.generation_jobs from public,anon,authenticated,service_role;
grant select on public.generation_jobs to authenticated;
grant select,insert,update on public.generation_jobs to service_role;
create policy generation_job_owner_read on public.generation_jobs for select to authenticated using
  (actor_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true' and exists
    (select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=(select auth.uid())));
create policy generation_job_boundary on public.generation_jobs as restrictive for all to authenticated using
  (actor_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true' and exists
    (select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=(select auth.uid())));

create function public.enqueue_generation_job(p_actor_id uuid,p_project_id uuid,p_operation_key uuid,p_kind text,
  p_input jsonb,p_fingerprint text,p_account_id uuid,p_catalog_version text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs; reservation jsonb;
begin
  if not exists(select 1 from auth.users where id=p_actor_id and not coalesce(is_anonymous,false)
      and email_confirmed_at is not null and (banned_until is null or banned_until<clock_timestamp())) then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id
      join public.users u on u.id=w.user_id where p.id=p_project_id and w.user_id=p_actor_id) then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('mock_script','script','cloud_render') or p_operation_key is null or p_input is null
    or jsonb_typeof(p_input)<>'object' or length(p_input::text)>4096 or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$'
    or (select count(*) from jsonb_object_keys(p_input))<>2 or not(p_input ? 'topic' and p_input ? 'version')
    or jsonb_typeof(p_input->'topic')<>'string' or length(btrim(p_input->>'topic')) not between 1 and 200
    or p_input->>'version' is distinct from (case when p_kind='cloud_render' then 'account-preview-v1' else 'short-script-v1' end) then raise exception 'INVALID_REQUEST'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text,0));
  select * into job from public.generation_jobs where actor_id=p_actor_id and operation_key=p_operation_key;
  if found then
    if job.project_id<>p_project_id or job.kind<>p_kind or job.input<>p_input or job.input_fingerprint<>p_fingerprint
      or job.account_id is distinct from p_account_id then raise exception 'OPERATION_CONFLICT'; end if;
    return job.id;
  end if;
  if (select count(*) from public.generation_jobs where actor_id=p_actor_id and state in ('queued','claimed','submitting','awaiting_provider','unknown'))>=4 then raise exception 'CONCURRENCY_LIMIT'; end if;
  if p_kind='mock_script' then
    if p_account_id is not null or p_catalog_version is not null then raise exception 'INVALID_REQUEST'; end if;
    -- Lifetime staging bound: canceling or deleting a project never replenishes it.
    if (select count(*) from public.generation_jobs where actor_id=p_actor_id and kind='mock_script')>=10 then raise exception 'LIMIT_REACHED'; end if;
  else
    if not exists(select 1 from public.account_access_configuration where singleton and paid_resource_limits) then raise exception 'FEATURE_UNAVAILABLE'; end if;
    if not exists(select 1 from public.billing_accounts a join public.billing_subscriptions s on s.account_id=a.id
      join public.account_approved_resource_plans cp on cp.plan_id=s.plan_id and cp.catalog_version=s.catalog_version
      where a.id=p_account_id and a.user_id=p_actor_id and a.stripe_mode='test' and s.is_current and s.catalog_version=p_catalog_version) then raise exception 'PLAN_NOT_CONFIGURED'; end if;
    reservation:=public.reserve_billing_operation(p_account_id,p_actor_id,p_project_id,p_operation_key::text,p_fingerprint,
      p_catalog_version,case when p_kind='cloud_render' then '{"render_seconds":5,"storage_bytes":3145728}'::jsonb else '{"llm_tokens":4096}'::jsonb end,4);
    if not (reservation->>'created')::boolean then raise exception 'OPERATION_CONFLICT'; end if;
  end if;
  insert into public.generation_jobs(actor_id,project_id,kind,operation_key,input,input_fingerprint,account_id,billing_operation_id)
    values(p_actor_id,p_project_id,p_kind,p_operation_key,p_input,p_fingerprint,p_account_id,(reservation->>'id')::uuid) returning * into job;
  return job.id;
end $$;

create function public.claim_generation_job(p_job_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if job.state='submitting' and job.lease_until<=clock_timestamp() then
    update public.generation_jobs set state='unknown',error_code='SUBMISSION_UNCERTAIN',updated_at=clock_timestamp() where id=p_job_id;
    return null;
  end if;
  if job.state in ('awaiting_provider','unknown') and job.provider_handle is not null then
    if job.lease_until>clock_timestamp() then return null; end if;
  elsif job.state not in ('queued','claimed') or (job.state='claimed' and job.lease_until>clock_timestamp()) then return null; end if;
  update public.generation_jobs set state='claimed',claim_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp()
    where id=p_job_id returning * into job;
  return to_jsonb(job);
end $$;

create function public.begin_generation_submission(p_job_id uuid,p_token uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  -- Ledger always locks account before job, consistently with finish/cancel.
  select * into job from public.generation_jobs where id=p_job_id;
  if job.account_id is not null then perform 1 from public.billing_accounts where id=job.account_id for update; end if;
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found or job.state<>'claimed' or job.provider_handle is not null or job.claim_token is distinct from p_token or job.lease_until<=clock_timestamp() then raise exception 'STALE_JOB'; end if;
  if not exists(select 1 from auth.users u join public.video_projects p on p.id=job.project_id
    join public.workspaces w on w.id=p.workspace_id where u.id=job.actor_id and w.user_id=u.id
      and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<clock_timestamp())) then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if job.account_id is not null then
    if not exists(select 1 from public.account_access_configuration where singleton and paid_resource_limits) then raise exception 'FEATURE_UNAVAILABLE'; end if;
    if not exists(select 1 from public.billing_accounts a join public.billing_subscriptions s on s.account_id=a.id
      where a.id=job.account_id and a.user_id=job.actor_id and a.enabled and s.is_current and s.status='active'
      and not s.pause_collection and s.verified_at<=clock_timestamp() and s.access_starts_at<=clock_timestamp() and s.access_expires_at>clock_timestamp()) then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
    if not exists(select 1 from public.billing_operations where id=job.billing_operation_id and account_id=job.account_id and state='reserved')
      or not exists(select 1 from public.billing_operation_items where operation_id=job.billing_operation_id)
      or exists(select 1 from public.billing_operation_items i join public.billing_usage_periods p on p.id=i.usage_period_id
        join public.billing_subscriptions s on s.account_id=job.account_id and s.is_current where i.operation_id=job.billing_operation_id
        and (p.subscription_id is distinct from s.id or p.catalog_version is distinct from s.catalog_version or p.window_start>clock_timestamp() or p.window_end<=clock_timestamp())) then raise exception 'BILLING_SYNC_PENDING'; end if;
    perform public.settle_billing_operation(job.account_id,job.billing_operation_id,'submission_uncertain',null,null,null);
  end if;
  update public.generation_jobs set state='submitting',updated_at=clock_timestamp() where id=p_job_id;
end $$;

create function public.finish_generation_job(p_job_id uuid,p_token uuid,p_outcome text,p_output text,p_request_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_job_id;
  if job.account_id is not null then perform 1 from public.billing_accounts where id=job.account_id for update; end if;
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found or job.claim_token is distinct from p_token or job.state not in ('claimed','submitting','unknown') then raise exception 'STALE_JOB'; end if;
  if p_outcome is null or p_outcome not in ('succeeded','canceled','unknown') or
    (p_outcome='succeeded' and ((job.state='claimed' and job.provider_handle is null) or p_output is null or octet_length(p_output) not between 1 and 32768)) or
    (p_outcome='canceled' and (job.state<>'claimed' or job.provider_handle is not null)) or (p_outcome<>'succeeded' and p_output is not null) then raise exception 'INVALID_TRANSITION'; end if;
  if job.account_id is not null then
    perform public.settle_billing_operation(job.account_id,job.billing_operation_id,
      case p_outcome when 'succeeded' then 'provider_completed' when 'canceled' then 'no_work_confirmed' else 'submission_uncertain' end,
      case when p_outcome='canceled' then null when job.kind='cloud_render' then 'remotion' else 'openai' end,p_request_id,
      case when p_outcome='unknown' then 'SUBMISSION_UNCERTAIN' else null end);
  end if;
  update public.generation_jobs set state=p_outcome,output=p_output,provider_request_id=coalesce(provider_request_id,p_request_id),
    error_code=case when p_outcome='unknown' then 'SUBMISSION_UNCERTAIN' when p_outcome='canceled' then 'NO_WORK_CONFIRMED' else null end,
    updated_at=clock_timestamp() where id=p_job_id;
end $$;

create function public.cancel_generation_job(p_job_id uuid,p_actor_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_job_id;
  if job.account_id is not null then perform 1 from public.billing_accounts where id=job.account_id for update; end if;
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found or job.actor_id<>p_actor_id or not exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id
    where p.id=job.project_id and w.user_id=p_actor_id) then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if job.state='canceled' then return; end if;
  if job.state not in ('queued','claimed') or job.provider_handle is not null then raise exception 'INVALID_TRANSITION'; end if;
  if job.account_id is not null then perform public.settle_billing_operation(job.account_id,job.billing_operation_id,'no_work_confirmed',null,null,null); end if;
  update public.generation_jobs set state='canceled',error_code='NO_WORK_CONFIRMED',updated_at=clock_timestamp() where id=p_job_id;
end $$;

revoke all on function public.enqueue_generation_job(uuid,uuid,uuid,text,jsonb,text,uuid,text),public.claim_generation_job(uuid),
  public.begin_generation_submission(uuid,uuid),public.finish_generation_job(uuid,uuid,text,text,text),public.cancel_generation_job(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.enqueue_generation_job(uuid,uuid,uuid,text,jsonb,text,uuid,text),public.claim_generation_job(uuid),
  public.begin_generation_submission(uuid,uuid),public.finish_generation_job(uuid,uuid,text,text,text),public.cancel_generation_job(uuid,uuid) to service_role;

create function public.accept_generation_render(p_job_id uuid,p_token uuid,p_handle jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_job_id;
  perform 1 from public.billing_accounts where id=job.account_id for update;
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found or job.kind<>'cloud_render' or job.state not in ('submitting','claimed') or (job.state='claimed' and job.provider_handle is null) or job.claim_token is distinct from p_token then raise exception 'STALE_JOB'; end if;
  if p_handle is null or jsonb_typeof(p_handle)<>'object' or length(p_handle::text)>2048
    or length(p_handle->>'renderId') not between 1 and 100 or length(p_handle->>'bucketName') not between 3 and 63
    or p_handle->>'objectKey' is distinct from 'account-preview/'||job.id::text||'.mp4'
    or (job.provider_handle is not null and job.provider_handle<>p_handle) then raise exception 'INVALID_REQUEST'; end if;
  perform public.settle_billing_operation(job.account_id,job.billing_operation_id,'provider_accepted','remotion',p_handle->>'renderId',null);
  update public.generation_jobs set provider_handle=p_handle,provider_request_id=p_handle->>'renderId',state='awaiting_provider',lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() where id=p_job_id;
end $$;
create function public.finish_private_render_job(p_job_id uuid,p_token uuid,p_size integer,p_hash text) returns void
language plpgsql security invoker set search_path='' as $$
declare job public.generation_jobs;
begin
  select * into job from public.generation_jobs where id=p_job_id;
  perform 1 from public.billing_accounts where id=job.account_id for update;
  select * into job from public.generation_jobs where id=p_job_id for update;
  if not found or job.kind<>'cloud_render' or job.state<>'claimed' or job.claim_token is distinct from p_token
    or job.provider_handle is null or p_size is null or p_size not between 1 and 3145728 or p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'STALE_JOB'; end if;
  insert into public.private_assets(id,project_id,actor_id,bucket,object_key,mime_type,byte_size,content_hash,state)
    values(job.id,job.project_id,job.actor_id,'renders',job.actor_id::text||'/'||job.project_id::text||'/'||job.id::text,'video/mp4',p_size,p_hash,'ready');
  insert into public.render_artifacts(id,project_id,asset_id,state) values(job.id,job.project_id,job.id,'ready');
  perform public.finish_generation_job(job.id,p_token,'succeeded',job.id::text,job.provider_request_id);
end $$;
revoke all on function public.accept_generation_render(uuid,uuid,jsonb),public.finish_private_render_job(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.accept_generation_render(uuid,uuid,jsonb),public.finish_private_render_job(uuid,uuid,integer,text) to service_role;
grant select,insert on public.private_assets,public.render_artifacts to service_role;
commit;
