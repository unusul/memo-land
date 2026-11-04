-- Security hardening after the final review: reserved group ids, verified emails, server-side roles,
-- immutable domain groups, no existence oracle for reserved ids, change rows for moves/removals/joins.

create function public.email_verified() returns boolean
  language sql stable security definer set search_path = public
as $$ select coalesce((select email_confirmed_at is not null from auth.users where id = auth.uid()), false) $$;

create function public.role_in(g text) returns text
  language sql stable security definer set search_path = public
as $$ select role from public.group_members where group_id = g and account_id = public.current_account() $$;

create function public.is_reserved_group_id(gid text) returns boolean
  language sql immutable
as $$ select gid like 'personal:%' or gid like 'domain:%' $$;

-- Removed members must still see the change that removed them, so their app drops the group.
drop policy changes_visible on public.changes;
create policy changes_visible on public.changes for select using (
  case type
    when 'group' then public.is_member(id) or account_id = public.current_account()
    else public.can_see(group_id, account_id)
  end
);

-- Moving an activity out of a group tells the old group's members too.
create or replace function public.log_activity_change() returns trigger
  language plpgsql security definer set search_path = public
as $$ begin
  insert into public.changes (type, id, group_id, account_id) values ('activity', new.id, new.group_id, new.account_id);
  if tg_op = 'UPDATE' and old.group_id is distinct from new.group_id then
    insert into public.changes (type, id, group_id, account_id) values ('activity', new.id, old.group_id, old.account_id);
  end if;
  return new;
end $$;

create or replace function public.ensure_account() returns text
  language plpgsql security definer set search_path = public
as $$
declare
  email text := auth.jwt() ->> 'email';
  acc text;
  pid text;
  g public.groups;
begin
  if auth.uid() is null or email is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  if not public.email_verified() then raise exception 'FORBIDDEN' using detail = 'email not verified'; end if;
  insert into public.accounts (user_id, account_id, email) values (auth.uid(), lower(email), email)
    on conflict (user_id) do nothing;
  acc := public.current_account();
  pid := 'personal:' || acc;
  insert into public.groups (id, kind, name, owner_id, version) values (pid, 'personal', 'Personale', acc, 1)
    on conflict (id) do nothing;
  select * into g from public.groups where id = pid;
  if g.kind <> 'personal' or g.owner_id is distinct from acc then
    raise exception 'FORBIDDEN' using detail = 'personal group id already taken';
  end if;
  insert into public.group_members (group_id, account_id, role) values (pid, acc, 'owner') on conflict do nothing;
  return acc;
end $$;

create or replace function public.join_domain_group(rejoin boolean default false) returns text
  language plpgsql security definer set search_path = public
as $$
declare
  d text := public.email_domain();
  acc text := public.current_account();
  gid text;
  g public.groups;
  added int;
begin
  if not public.email_verified() then raise exception 'FORBIDDEN' using detail = 'email not verified'; end if;
  if acc is null then raise exception 'FORBIDDEN' using detail = 'call ensure_account first'; end if;
  if d is null or d = '' or exists (select 1 from public.public_domains where domain = d) then return null; end if;
  gid := 'domain:' || d;
  if rejoin then
    delete from public.domain_leaves where group_id = gid and account_id = acc;
  elsif exists (select 1 from public.domain_leaves where group_id = gid and account_id = acc) then
    return null;
  end if;
  insert into public.groups (id, kind, name, domain, version) values (gid, 'domain', d, d, 1) on conflict (id) do nothing;
  select * into g from public.groups where id = gid;
  if g.kind <> 'domain' or g.domain is distinct from d then
    raise exception 'FORBIDDEN' using detail = 'domain group id already taken';
  end if;
  insert into public.group_members (group_id, account_id, role) values (gid, acc, 'member') on conflict do nothing;
  get diagnostics added = row_count;
  -- A new member changes the group: bump it so the other members' apps reload.
  if added > 0 then update public.groups set version = version + 1 where id = gid; end if;
  return gid;
end $$;

create or replace function public.group_exists(gid text) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.groups where id = gid)
          and (not public.is_reserved_group_id(gid) or public.is_member(gid)) $$;

create or replace function public.save_group(doc jsonb, expected int) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  me text := public.current_account();
  gid text := doc ->> 'id';
  kind text := doc ->> 'kind';
  new_owner text := doc ->> 'ownerId';
  stored public.groups;
  existed boolean;
  my_role text;
  next_version int;
  old_members jsonb;
  new_members jsonb := coalesce(doc -> 'members', '{}'::jsonb);
  k text;
  old_r text;
  new_r text;
begin
  if me is null then raise exception 'FORBIDDEN' using detail = 'no account'; end if;
  if gid is null or kind is null then raise exception 'INVALID_INPUT' using detail = 'id and kind are required'; end if;
  select * into stored from public.groups where id = gid;
  existed := found;
  select coalesce(jsonb_object_agg(account_id, role), '{}'::jsonb) into old_members from public.group_members where group_id = gid;

  if not existed then
    -- Only invite groups are created here; personal and domain groups come from onboarding.
    if kind <> 'invite' or public.is_reserved_group_id(gid) then raise exception 'FORBIDDEN' using detail = 'only invite groups can be created'; end if;
    if new_members <> jsonb_build_object(me, 'owner') or new_owner is distinct from me then
      raise exception 'FORBIDDEN' using detail = 'a new group starts with its creator as only member and owner';
    end if;
  else
    my_role := old_members ->> me;
    if my_role is null then raise exception 'FORBIDDEN'; end if;
    if stored.kind <> kind then raise exception 'FORBIDDEN' using detail = 'kind cannot change'; end if;

    if kind = 'personal' then
      if new_members <> old_members or new_owner is distinct from stored.owner_id then raise exception 'FORBIDDEN' using detail = 'personal groups have one member'; end if;
    elsif kind = 'domain' then
      if (doc ->> 'name') is distinct from stored.name or (doc ->> 'domain') is distinct from stored.domain
         or new_owner is not null or coalesce(doc ->> 'timeZone', stored.time_zone) <> stored.time_zone then
        raise exception 'FORBIDDEN' using detail = 'domain group fields are fixed';
      end if;
      for k in select key from jsonb_each_text(new_members) union select key from jsonb_each_text(old_members) loop
        old_r := old_members ->> k; new_r := new_members ->> k;
        if old_r is distinct from new_r and (k <> me or coalesce(new_r, 'member') <> 'member') then
          raise exception 'FORBIDDEN' using detail = 'in a domain group you can only join or leave yourself';
        end if;
      end loop;
    else -- invite
      if (select count(*) from jsonb_each_text(new_members) where value = 'owner') <> 1 or (new_members ->> new_owner) is distinct from 'owner' then
        raise exception 'FORBIDDEN' using detail = 'an invite group has exactly one owner';
      end if;
      if my_role = 'owner' then
        if new_owner <> stored.owner_id and not (old_members ? new_owner) then raise exception 'FORBIDDEN' using detail = 'ownership goes to an existing member'; end if;
      else
        if new_owner is distinct from stored.owner_id or (doc ->> 'name') is distinct from stored.name
           or coalesce(doc ->> 'timeZone', stored.time_zone) <> stored.time_zone then
          raise exception 'FORBIDDEN' using detail = 'only the owner changes the group';
        end if;
        for k in select key from jsonb_each_text(new_members) union select key from jsonb_each_text(old_members) loop
          old_r := old_members ->> k; new_r := new_members ->> k;
          continue when old_r is not distinct from new_r;
          if k = me then
            if new_r is not null then raise exception 'FORBIDDEN' using detail = 'you cannot change your own role'; end if;
          elsif my_role = 'guest' then
            raise exception 'FORBIDDEN' using detail = 'guests cannot change members';
          elsif old_r is null and new_r in ('member', 'guest') then
            null; -- invite
          elsif new_r is null and old_r <> 'owner' then
            null; -- remove a member or guest
          else
            raise exception 'FORBIDDEN' using detail = 'members cannot change roles or remove the owner';
          end if;
        end loop;
      end if;
    end if;
  end if;

  next_version := coalesce(expected, (doc ->> 'version')::int) + 1;
  if expected is null then
    insert into public.groups (id, kind, name, domain, owner_id, time_zone, version)
      values (gid, kind, doc ->> 'name', doc ->> 'domain', new_owner, coalesce(doc ->> 'timeZone', 'Europe/Rome'), next_version)
      on conflict (id) do nothing;
  else
    update public.groups
       set name = doc ->> 'name', owner_id = new_owner, time_zone = coalesce(doc ->> 'timeZone', time_zone), version = next_version
     where id = gid and version = expected;
  end if;
  if not found then raise exception 'VERSION_CONFLICT'; end if;

  -- Touch only the rows that change, so concurrent joins are not dropped and recorded as leaves.
  delete from public.group_members m where m.group_id = gid and not (new_members ? m.account_id);
  insert into public.group_members (group_id, account_id, role)
    select gid, key, value from jsonb_each_text(new_members)
    on conflict (group_id, account_id) do update set role = excluded.role where public.group_members.role <> excluded.role;
  insert into public.changes (type, id, account_id)
    select 'group', gid, key from jsonb_each_text(old_members) where not (new_members ? key);
  return next_version;
end $$;

create or replace function public.save_activity(doc jsonb, expected int) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  me text := public.current_account();
  act_id text := doc ->> 'id';
  new_group text := doc ->> 'groupId';
  new_owner text := doc ->> 'accountId';
  stored public.activities;
  next_version int;
  saved jsonb;
begin
  if me is null then raise exception 'FORBIDDEN' using detail = 'no account'; end if;
  if act_id is null or new_owner is null then raise exception 'INVALID_INPUT' using detail = 'id and accountId are required'; end if;
  select * into stored from public.activities where id = act_id;
  if found then
    if not public.can_see(stored.group_id, stored.account_id) then raise exception 'FORBIDDEN'; end if;
    if stored.account_id <> new_owner then raise exception 'FORBIDDEN' using detail = 'the owning account never changes'; end if;
    -- Guests may only act on what is assigned to them, inside the same group.
    if stored.group_id is not null and public.role_in(stored.group_id) = 'guest'
       and (new_group is distinct from stored.group_id or (stored.doc -> 'props' -> 'assignment' ->> 'assignee') is distinct from me) then
      raise exception 'FORBIDDEN' using detail = 'guests only update their own assignments';
    end if;
  elsif new_group is not null and public.role_in(new_group) = 'guest' then
    raise exception 'FORBIDDEN' using detail = 'guests cannot create activities';
  end if;
  if not public.can_see(new_group, new_owner) then raise exception 'FORBIDDEN'; end if;

  next_version := coalesce(expected, (doc ->> 'version')::int) + 1;
  saved := jsonb_set(doc, '{version}', to_jsonb(next_version));
  if expected is null then
    insert into public.activities (id, account_id, group_id, doc, version)
      values (act_id, new_owner, new_group, saved, next_version)
      on conflict (id) do nothing;
  else
    update public.activities
       set group_id = new_group, doc = saved, version = next_version, updated_at = now()
     where id = act_id and version = expected;
  end if;
  if not found then raise exception 'VERSION_CONFLICT'; end if;
  return saved;
end $$;

revoke all on function public.email_verified() from public, anon;
revoke all on function public.role_in(text) from public, anon;
grant execute on function public.email_verified() to authenticated;
grant execute on function public.role_in(text) to authenticated;
