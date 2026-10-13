-- Apply after 009. Metadata staging remains bounded; paid enforcement is an
-- explicit database switch and cannot be bypassed through the old owned RPCs.
begin;
create table public.account_access_configuration (
  singleton boolean primary key default true check(singleton),
  paid_resource_limits boolean not null default false
);
insert into public.account_access_configuration(singleton) values(true);
create table public.account_approved_resource_plans (
  plan_id text not null,catalog_version text not null,workspace_limit integer not null check(workspace_limit between 0 and 3),
  primary key(plan_id,catalog_version)
);
-- Empty until the operator installs the SAME approved catalog as the server.
create table public.account_resource_creation_receipts (
  resource_id uuid primary key,actor_id uuid not null references auth.users(id),
  usage_period_id uuid not null references public.billing_usage_periods(id),created_at timestamptz not null default now()
);
alter table public.account_access_configuration enable row level security;
alter table public.account_approved_resource_plans enable row level security;
alter table public.account_resource_creation_receipts enable row level security;
revoke all on public.account_access_configuration,public.account_approved_resource_plans,public.account_resource_creation_receipts from public,anon,authenticated,service_role;
grant select on public.account_access_configuration,public.account_approved_resource_plans,public.account_resource_creation_receipts to service_role;

create function public.guard_account_resource_creation() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid; account public.billing_accounts; subscription public.billing_subscriptions;
  plan public.account_approved_resource_plans; allowance public.billing_usage_periods;
begin
  if tg_table_name='workspaces' then actor:=new.user_id;
  else select user_id into actor from public.workspaces where id=new.workspace_id; end if;
  if actor is null then raise exception 'OWNERSHIP_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  if not (select paid_resource_limits from public.account_access_configuration where singleton) then
    -- The existing RPC already limits workspaces to three and onboarding to
    -- one first draft. No other browser insert grant is opened by this migration.
    return new;
  end if;
  select * into account from public.billing_accounts where user_id=actor and stripe_mode='test' for update;
  if not found or not account.enabled then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
  select * into subscription from public.billing_subscriptions where account_id=account.id and is_current for update;
  if not found or subscription.status<>'active' or subscription.pause_collection or subscription.verified_at is null
    or subscription.verified_at>clock_timestamp() or subscription.access_starts_at is null or subscription.access_starts_at>clock_timestamp()
    or subscription.access_expires_at is null or subscription.access_expires_at<=clock_timestamp() then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
  select * into plan from public.account_approved_resource_plans where plan_id=subscription.plan_id and catalog_version=subscription.catalog_version;
  if not found then raise exception 'PLAN_NOT_CONFIGURED'; end if;
  if tg_table_name='workspaces' then
    if (select count(*) from public.workspaces where user_id=actor)>=plan.workspace_limit then raise exception 'LIMIT_REACHED'; end if;
  else
    if (select count(*) from public.billing_usage_periods where account_id=account.id and metric='projects'
      and window_start<=clock_timestamp() and window_end>clock_timestamp())<>1 then raise exception 'BILLING_SYNC_PENDING'; end if;
    select * into allowance from public.billing_usage_periods where account_id=account.id and metric='projects'
      and window_start<=clock_timestamp() and window_end>clock_timestamp() for update;
    if allowance.subscription_id is distinct from subscription.id or allowance.catalog_version<>plan.catalog_version then raise exception 'BILLING_SYNC_PENDING'; end if;
    if allowance.limit_quantity-allowance.used_quantity-allowance.reserved_quantity<1 then raise exception 'LIMIT_REACHED'; end if;
    update public.billing_usage_periods set used_quantity=used_quantity+1,updated_at=clock_timestamp() where id=allowance.id;
    insert into public.account_resource_creation_receipts(resource_id,actor_id,usage_period_id) values(new.id,actor,allowance.id);
  end if;
  return new;
end $$;
revoke all on function public.guard_account_resource_creation() from public,anon,authenticated,service_role;
create trigger account_workspace_allowance before insert on public.workspaces for each row execute function public.guard_account_resource_creation();
create trigger account_project_allowance before insert on public.video_projects for each row execute function public.guard_account_resource_creation();
commit;
