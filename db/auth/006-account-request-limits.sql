begin;
create table public.account_request_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,window_start timestamptz not null,hits integer not null,
  primary key(actor_id,action,window_start)
);
alter table public.account_request_limits enable row level security;
revoke all on public.account_request_limits from public,anon,authenticated;
create or replace function public.admit_account_request(p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); counter integer; maximum integer;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  maximum:=case p_action when 'upload' then 10 when 'import' then 5 when 'sign' then 60 when 'workspace' then 10 when 'rename' then 30 else 0 end;
  if maximum=0 then raise exception 'INVALID_ACTION'; end if;
  insert into public.account_request_limits(actor_id,action,window_start,hits)
    values(actor,p_action,date_trunc('minute',now()),1)
    on conflict(actor_id,action,window_start) do update set hits=public.account_request_limits.hits+1
    returning hits into counter;
  if counter>maximum then raise exception 'REQUEST_RATE_LIMIT'; end if;
  delete from public.account_request_limits where window_start<now()-interval '24 hours';
end $$;
revoke all on function public.admit_account_request(text) from public,anon,authenticated;
grant execute on function public.admit_account_request(text) to authenticated;
commit;
