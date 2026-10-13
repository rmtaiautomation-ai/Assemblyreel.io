begin;
create or replace function public.sync_account_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email is not null and new.is_anonymous is not true then
    update public.users set email=new.email where id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.sync_account_email() from public,anon,authenticated;
drop trigger if exists sync_confirmed_account_email on auth.users;
create trigger sync_confirmed_account_email after update of email on auth.users
  for each row execute function public.sync_account_email();
commit;
