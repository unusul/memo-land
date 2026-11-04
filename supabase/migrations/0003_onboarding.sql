-- Onboarding: account row, personal group and automatic domain group membership.
-- Everything is derived from the caller's JWT, never from parameters.

create table public.domain_leaves (
  group_id text not null references public.groups on delete cascade,
  account_id text not null,
  primary key (group_id, account_id)
);
alter table public.domain_leaves enable row level security;

create function public.ensure_account() returns text
  language plpgsql security definer set search_path = public
as $$
declare
  email text := auth.jwt() ->> 'email';
  acc text;
  pid text;
begin
  if auth.uid() is null or email is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  insert into public.accounts (user_id, account_id, email) values (auth.uid(), lower(email), email)
    on conflict (user_id) do nothing;
  acc := public.current_account();
  pid := 'personal:' || acc;
  insert into public.groups (id, kind, name, owner_id, version) values (pid, 'personal', 'Personale', acc, 1)
    on conflict (id) do nothing;
  insert into public.group_members (group_id, account_id, role) values (pid, acc, 'owner')
    on conflict do nothing;
  return acc;
end $$;

/** Joins the caller's email-domain group; after a voluntary leave only with rejoin = true. */
create function public.join_domain_group(rejoin boolean default false) returns text
  language plpgsql security definer set search_path = public
as $$
declare
  d text := public.email_domain();
  acc text := public.current_account();
  gid text;
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'call ensure_account first'; end if;
  if d is null or d = '' or exists (select 1 from public.public_domains where domain = d) then return null; end if;
  gid := 'domain:' || d;
  if rejoin then
    delete from public.domain_leaves where group_id = gid and account_id = acc;
  elsif exists (select 1 from public.domain_leaves where group_id = gid and account_id = acc) then
    return null;
  end if;
  insert into public.groups (id, kind, name, domain, version) values (gid, 'domain', d, d, 1)
    on conflict (id) do nothing;
  insert into public.group_members (group_id, account_id, role) values (gid, acc, 'member')
    on conflict do nothing;
  return gid;
end $$;

/** Records voluntary leaves from domain groups so onboarding does not re-add the account. */
create function public.record_domain_leave() returns trigger
  language plpgsql security definer set search_path = public
as $$ begin
  if exists (select 1 from public.groups g where g.id = old.group_id and g.kind = 'domain') then
    insert into public.domain_leaves (group_id, account_id) values (old.group_id, old.account_id) on conflict do nothing;
  end if;
  return old;
end $$;

-- save_group rewrites the member list (delete + insert); only rows that do not come back count as leaves.
create function public.forget_rejoined_leave() returns trigger
  language plpgsql security definer set search_path = public
as $$ begin
  delete from public.domain_leaves where group_id = new.group_id and account_id = new.account_id;
  return new;
end $$;

create trigger group_member_left after delete on public.group_members
  for each row execute function public.record_domain_leave();
create trigger group_member_back after insert on public.group_members
  for each row execute function public.forget_rejoined_leave();

revoke all on function public.ensure_account() from public, anon;
revoke all on function public.join_domain_group(boolean) from public, anon;
grant execute on function public.ensure_account() to authenticated;
grant execute on function public.join_domain_group(boolean) to authenticated;
