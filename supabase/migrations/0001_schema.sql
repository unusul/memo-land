-- Central engine schema. Reads are filtered by row level security; there are no write
-- policies: every write goes through the security-definer functions of later migrations.

create table public.accounts (
  user_id uuid primary key references auth.users on delete cascade,
  account_id text unique not null,
  email text not null
);

create table public.groups (
  id text primary key,
  kind text not null check (kind in ('personal', 'domain', 'invite')),
  name text not null,
  domain text,
  owner_id text,
  time_zone text not null default 'Europe/Rome',
  version int not null
);

create table public.group_members (
  group_id text not null references public.groups on delete cascade,
  account_id text not null,
  role text not null check (role in ('owner', 'member', 'guest')),
  primary key (group_id, account_id)
);

create table public.activities (
  id text primary key,
  account_id text not null,
  group_id text references public.groups,
  doc jsonb not null,
  version int not null,
  updated_at timestamptz not null default now()
);
create index activities_group_idx on public.activities (group_id);
create index activities_account_idx on public.activities (account_id) where group_id is null;

create table public.changes (
  cursor bigserial primary key,
  type text not null check (type in ('activity', 'group')),
  id text not null,
  group_id text,
  account_id text,
  at timestamptz not null default now()
);

create table public.public_domains (
  domain text primary key
);

create function public.current_account() returns text
  language sql stable security definer set search_path = public
as $$ select account_id from public.accounts where user_id = auth.uid() $$;

create function public.is_member(g text) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.group_members m where m.group_id = g and m.account_id = public.current_account()) $$;

create function public.can_see(g text, owner text) returns boolean
  language sql stable security definer set search_path = public
as $$ select case when g is null then owner = public.current_account() else public.is_member(g) end $$;

alter table public.accounts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.activities enable row level security;
alter table public.changes enable row level security;
alter table public.public_domains enable row level security;

create policy accounts_self on public.accounts for select using (user_id = auth.uid());
create policy groups_members on public.groups for select using (public.is_member(id));
create policy group_members_members on public.group_members for select using (public.is_member(group_id));
create policy activities_visible on public.activities for select using (public.can_see(group_id, account_id));
create policy changes_visible on public.changes for select using (
  case type when 'group' then public.is_member(id) else public.can_see(group_id, account_id) end
);

create function public.log_activity_change() returns trigger
  language plpgsql security definer set search_path = public
as $$ begin
  insert into public.changes (type, id, group_id, account_id) values ('activity', new.id, new.group_id, new.account_id);
  return new;
end $$;

create function public.log_group_change() returns trigger
  language plpgsql security definer set search_path = public
as $$ begin
  insert into public.changes (type, id) values ('group', new.id);
  return new;
end $$;

create trigger activities_changed after insert or update on public.activities
  for each row execute function public.log_activity_change();
create trigger groups_changed after insert or update on public.groups
  for each row execute function public.log_group_change();

-- Attachments: private bucket, objects stored at "<activityId>/<uuid>".
insert into storage.buckets (id, name, public, file_size_limit) values ('attachments', 'attachments', false, 10485760);

create function public.can_see_activity(activity_id text) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.activities a where a.id = activity_id and public.can_see(a.group_id, a.account_id)) $$;

create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and public.can_see_activity((storage.foldername(name))[1]));
create policy attachments_write on storage.objects for insert
  with check (bucket_id = 'attachments' and public.can_see_activity((storage.foldername(name))[1]));
