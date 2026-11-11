-- Group types: a group of activities (every group so far) or a list. Only the owner of an invite group changes it;
-- personal and domain groups stay groups of activities.

alter table public.groups add column type text not null default 'activities' check (type in ('activities', 'list'));

create or replace function public.save_group(doc jsonb, expected int) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  me text := public.current_account();
  gid text := doc ->> 'id';
  kind text := doc ->> 'kind';
  gtype text := coalesce(doc ->> 'type', 'activities');
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
  if gtype not in ('activities', 'list') then raise exception 'INVALID_INPUT' using detail = 'type is activities or list'; end if;
  if kind <> 'invite' and gtype <> 'activities' then raise exception 'FORBIDDEN' using detail = 'only invite groups have a type'; end if;
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
           or coalesce(doc ->> 'timeZone', stored.time_zone) <> stored.time_zone or gtype <> stored.type then
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
    insert into public.groups (id, kind, type, name, domain, owner_id, time_zone, version)
      values (gid, kind, gtype, doc ->> 'name', doc ->> 'domain', new_owner, coalesce(doc ->> 'timeZone', 'Europe/Rome'), next_version)
      on conflict (id) do nothing;
  else
    update public.groups
       set name = doc ->> 'name', type = gtype, owner_id = new_owner, time_zone = coalesce(doc ->> 'timeZone', time_zone), version = next_version
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
