-- Server-side security tests (pgTAP), run with: npm run db -- test db
-- Each block impersonates a user through the JWT claims the SQL functions read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.as_user(uid uuid, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'attacker@evil.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'victim@acme.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'boss@acme.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'guest@else.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'member@else.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000f', 'unverified@acme.test', null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000010', 'mario@gmail.com', now(), 'authenticated', 'authenticated');

-- Onboard everyone except the victim and the unverified user.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'attacker@evil.test'); select public.ensure_account();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'boss@acme.test'); select public.ensure_account();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'guest@else.test'); select public.ensure_account();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'member@else.test'); select public.ensure_account();

-- Critical 1: reserved ids and kinds cannot be created through save_group.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'attacker@evil.test');
select throws_ok($$ select public.save_group('{"id":"personal:victim@acme.test","kind":"invite","name":"x","ownerId":"attacker@evil.test","members":{"attacker@evil.test":"owner"},"version":1}', null) $$,
  'FORBIDDEN', 'cannot squat a personal group id');
select throws_ok($$ select public.save_group('{"id":"domain:acme.test","kind":"invite","name":"x","ownerId":"attacker@evil.test","members":{"attacker@evil.test":"owner"},"version":1}', null) $$,
  'FORBIDDEN', 'cannot squat a domain group id');
select throws_ok($$ select public.save_group('{"id":"g-dom","kind":"domain","name":"evil.test","domain":"evil.test","members":{"attacker@evil.test":"member"},"version":1}', null) $$,
  'FORBIDDEN', 'domain groups are created only by onboarding');
select throws_ok($$ select public.save_group('{"id":"g-pers","kind":"personal","name":"x","ownerId":"attacker@evil.test","members":{"attacker@evil.test":"owner"},"version":1}', null) $$,
  'FORBIDDEN', 'personal groups are created only by onboarding');
select throws_ok($$ select public.save_group('{"id":"g-crowd","kind":"invite","name":"x","ownerId":"attacker@evil.test","members":{"attacker@evil.test":"owner","boss@acme.test":"member"},"version":1}', null) $$,
  'FORBIDDEN', 'a new invite group starts with its creator as only member');

-- Critical 1 (onboarding side): an existing row with a reserved id but the wrong kind/owner is never reused.
select pg_temp.as_admin();
insert into public.groups (id, kind, name, owner_id, version) values ('personal:victim@acme.test', 'invite', 'trap', 'attacker@evil.test', 1);
insert into public.group_members values ('personal:victim@acme.test', 'attacker@evil.test', 'owner');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'victim@acme.test');
select throws_ok($$ select public.ensure_account() $$, 'FORBIDDEN', 'onboarding refuses a squatted personal id');
select pg_temp.as_admin(); delete from public.groups where id = 'personal:victim@acme.test';

-- Critical 2: an unverified email can neither create an account nor join a domain group.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f', 'unverified@acme.test');
select throws_ok($$ select public.ensure_account() $$, 'FORBIDDEN', 'unverified email cannot onboard');
select throws_ok($$ select public.join_domain_group(false) $$, 'FORBIDDEN', 'unverified email cannot join a domain group');

-- Critical 3: public domains are part of the schema, not only of local seed data.
select pg_temp.as_admin();
select ok((select count(*) from public.public_domains) >= 20, 'public domains are loaded by a migration');
select pg_temp.as_user('00000000-0000-0000-0000-000000000010', 'mario@gmail.com'); select public.ensure_account();
select is(public.join_domain_group(false), null, 'gmail.com forms no domain group');

-- Important 5: roles inside an invite group are enforced by the server.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'member@else.test');
select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"member@else.test":"owner"},"version":1}', null);
select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"member@else.test":"owner","guest@else.test":"guest","boss@acme.test":"member"},"version":2}', 2);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'guest@else.test');
select throws_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"mine","ownerId":"guest@else.test","members":{"guest@else.test":"owner","boss@acme.test":"member"},"version":3}', 3) $$,
  'FORBIDDEN', 'a guest cannot take over the group');
select throws_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"member@else.test":"owner","guest@else.test":"guest","boss@acme.test":"member","attacker@evil.test":"member"},"version":3}', 3) $$,
  'FORBIDDEN', 'a guest cannot invite');
select throws_ok($$ select public.save_activity('{"id":"act-g","accountId":"guest@else.test","groupId":"inv:team","title":"t","body":"","attachments":[],"props":{},"status":"open","overrides":{},"history":[],"createdAt":"x","updatedAt":"x","version":1}', null) $$,
  'FORBIDDEN', 'a guest cannot create activities');
select lives_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"member@else.test":"owner","boss@acme.test":"member"},"version":3}', 3) $$,
  'a guest can leave');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'boss@acme.test');
select throws_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"boss@acme.test":"member"},"version":4}', 4) $$,
  'FORBIDDEN', 'a member cannot remove the owner');
select throws_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"boss@acme.test","members":{"member@else.test":"member","boss@acme.test":"owner"},"version":4}', 4) $$,
  'FORBIDDEN', 'a member cannot make itself owner');
select throws_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"renamed","ownerId":"member@else.test","members":{"member@else.test":"owner","boss@acme.test":"member"},"version":4}', 4) $$,
  'FORBIDDEN', 'a member cannot rename the group');
select lives_ok($$ select public.save_group('{"id":"inv:team","kind":"invite","name":"team","ownerId":"member@else.test","members":{"member@else.test":"owner","boss@acme.test":"member","guest@else.test":"guest"},"version":4}', 4) $$,
  'a member can invite a guest');

-- Important 6: domain group fields are immutable.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'boss@acme.test');
select public.join_domain_group(false);
select throws_ok($$ select public.save_group(jsonb_build_object('id','domain:acme.test','kind','domain','name','acme.test','domain','acme.test','ownerId','boss@acme.test','members',jsonb_build_object('boss@acme.test','member'),'version',(select version from public.groups where id = 'domain:acme.test')), (select version from public.groups where id = 'domain:acme.test')) $$,
  'FORBIDDEN', 'nobody can own a domain group');

-- Important 11: reserved ids do not reveal whether they exist.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'attacker@evil.test');
select is(public.group_exists('personal:boss@acme.test'), false, 'personal ids are not an existence oracle');
select is(public.group_exists('domain:acme.test'), false, 'domain ids are not an existence oracle');

-- Important 12: joining bumps the group so other members notice; a removed member gets a change row.
select pg_temp.as_admin();
select ok(exists (select 1 from public.changes where type = 'group' and id = 'domain:acme.test'), 'joining a domain group logs a group change');
select ok(exists (select 1 from public.changes where type = 'group' and id = 'inv:team' and account_id = 'guest@else.test'), 'a removed member gets its own change row');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'guest@else.test');
select ok(exists (select 1 from public.changes where type = 'group' and id = 'inv:team'), 'the removed member can read that change');

select * from finish();
rollback;
