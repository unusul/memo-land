-- Atomic writes. Each function checks visibility and version and writes in a single statement,
-- so two parallel saves from the same version cannot both succeed.
-- Errors: raise 'VERSION_CONFLICT' / 'FORBIDDEN' (SQLSTATE P0001); the engine maps them to DomainError.

create function public.email_domain() returns text
  language sql stable
as $$ select lower(split_part(auth.jwt() ->> 'email', '@', 2)) $$;

create function public.save_activity(doc jsonb, expected int) returns jsonb
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
  select * into stored from public.activities where id = act_id;
  if found and not public.can_see(stored.group_id, stored.account_id) then raise exception 'FORBIDDEN'; end if;
  if not public.can_see(new_group, new_owner) then raise exception 'FORBIDDEN'; end if;

  next_version := coalesce(expected, (doc ->> 'version')::int) + 1;
  saved := jsonb_set(doc, '{version}', to_jsonb(next_version));

  if expected is null then
    insert into public.activities (id, account_id, group_id, doc, version)
      values (act_id, new_owner, new_group, saved, next_version)
      on conflict (id) do nothing;
  else
    update public.activities
       set account_id = new_owner, group_id = new_group, doc = saved, version = next_version, updated_at = now()
     where id = act_id and version = expected;
  end if;
  if not found then raise exception 'VERSION_CONFLICT'; end if;
  return saved;
end $$;

create function public.save_group(doc jsonb, expected int) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  me text := public.current_account();
  gid text := doc ->> 'id';
  kind text := doc ->> 'kind';
  stored public.groups;
  next_version int;
  old_members jsonb;
  new_members jsonb := coalesce(doc -> 'members', '{}'::jsonb);
  changed_keys text[];
  existed boolean;
begin
  if me is null then raise exception 'FORBIDDEN' using detail = 'no account'; end if;
  select * into stored from public.groups where id = gid;
  existed := found;
  if existed then
    if not public.is_member(gid) then raise exception 'FORBIDDEN'; end if;
    if stored.kind <> kind then raise exception 'FORBIDDEN' using detail = 'kind cannot change'; end if;
  else
    if not (new_members ? me) then raise exception 'FORBIDDEN' using detail = 'creator must be a member'; end if;
    if kind = 'domain' and (doc ->> 'domain') is distinct from public.email_domain() then
      raise exception 'FORBIDDEN' using detail = 'domain does not match your email';
    end if;
  end if;

  select coalesce(jsonb_object_agg(account_id, role), '{}'::jsonb) into old_members from public.group_members where group_id = gid;
  select array_agg(k) into changed_keys from (
    select key as k from jsonb_each_text(new_members) n where (old_members ->> n.key) is distinct from n.value
    union
    select key from jsonb_each_text(old_members) o where not (new_members ? o.key)
  ) d;

  if existed and kind = 'domain' then
    if changed_keys is not null and (array_length(changed_keys, 1) > 1 or changed_keys[1] <> me
        or coalesce(new_members ->> me, 'member') <> 'member') then
      raise exception 'FORBIDDEN' using detail = 'in a domain group you can only join or leave yourself';
    end if;
  end if;
  if existed and kind = 'invite' and (doc ->> 'ownerId') is distinct from stored.owner_id and stored.owner_id <> me then
    raise exception 'FORBIDDEN' using detail = 'only the owner can change ownership';
  end if;

  next_version := coalesce(expected, (doc ->> 'version')::int) + 1;
  if expected is null then
    insert into public.groups (id, kind, name, domain, owner_id, time_zone, version)
      values (gid, kind, doc ->> 'name', doc ->> 'domain', doc ->> 'ownerId', coalesce(doc ->> 'timeZone', 'Europe/Rome'), next_version)
      on conflict (id) do nothing;
  else
    update public.groups
       set name = doc ->> 'name', domain = doc ->> 'domain', owner_id = doc ->> 'ownerId',
           time_zone = coalesce(doc ->> 'timeZone', time_zone), version = next_version
     where id = gid and version = expected;
  end if;
  if not found then raise exception 'VERSION_CONFLICT'; end if;

  delete from public.group_members where group_id = gid;
  insert into public.group_members (group_id, account_id, role)
    select gid, key, value from jsonb_each_text(new_members);
  return next_version;
end $$;

create function public.activity_exists(act_id text) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.activities where id = act_id) $$;

revoke all on function public.save_activity(jsonb, int) from public, anon;
revoke all on function public.save_group(jsonb, int) from public, anon;
revoke all on function public.activity_exists(text) from public, anon;
grant execute on function public.save_activity(jsonb, int) to authenticated;
grant execute on function public.save_group(jsonb, int) to authenticated;
grant execute on function public.activity_exists(text) to authenticated;

create function public.group_exists(gid text) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.groups where id = gid) $$;
revoke all on function public.group_exists(text) from public, anon;
grant execute on function public.group_exists(text) to authenticated;
