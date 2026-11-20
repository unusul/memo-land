-- The Vault in Io (user's choices, 2026-11-20): entries with a title in clear and a value encrypted in the browser, so
-- that nobody reads the value without the person's key, not the server nor whoever runs the database. The key comes
-- from a passkey (WebAuthn's PRF extension: Windows Hello through Google's password manager, the phone), never a
-- passphrase. The Vault has a key of its own, random; each passkey keeps a copy of it, encrypted with what that passkey
-- gives, so any of them opens it. Lose them all and the values are lost: here they are only ciphertext.
--
-- * As 0010, no policies on the two tables: the app reaches them only through the functions below, each on the
--   caller's own rows.
-- * The contract of the engines does not change: the Vault is the person's, not a group's, and only on this engine.

create table public.vault_keys (
  credential_id text primary key,
  account_id text not null,
  -- The PRF's input for this passkey, and the Vault's key encrypted with what it gives (AES-GCM, base64url).
  prf_salt text not null,
  wrapped_key text not null,
  iv text not null,
  -- «PC», «Telefono»: what the person called it, to take it away later.
  label text not null,
  created_at timestamptz not null default now(),
  constraint vault_keys_sizes check (length(credential_id) <= 512 and length(prf_salt) <= 128 and length(wrapped_key) <= 256
    and length(iv) <= 64 and length(label) between 1 and 60)
);
create index vault_keys_account on public.vault_keys (account_id);
alter table public.vault_keys enable row level security;

create table public.vault_entries (
  id uuid primary key,
  account_id text not null,
  title text not null,
  -- The value encrypted with the Vault's key (AES-GCM, base64url), and its nonce.
  value text not null,
  iv text not null,
  updated_at timestamptz not null default now(),
  constraint vault_entries_sizes check (length(title) between 1 and 200 and length(value) <= 12000 and length(iv) <= 64)
);
create index vault_entries_account on public.vault_entries (account_id);
alter table public.vault_entries enable row level security;

create function public.vault_account() returns text
  language plpgsql stable security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  return acc;
end $$;

/** The caller's passkeys, oldest first. */
create function public.vault_keys_list() returns jsonb
  language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('credentialId', k.credential_id, 'prfSalt', k.prf_salt,
    'wrappedKey', k.wrapped_key, 'iv', k.iv, 'label', k.label, 'createdAt', k.created_at) order by k.created_at), '[]'::jsonb)
  from public.vault_keys k where k.account_id = public.vault_account()
$$;

/** One more passkey for the caller's Vault; a credential of someone else is refused. */
create function public.vault_key_add(credential_id text, prf_salt text, wrapped_key text, iv text, label text) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.vault_account();
begin
  if exists (select 1 from public.vault_keys k where k.credential_id = vault_key_add.credential_id and k.account_id <> acc) then
    raise exception 'FORBIDDEN' using detail = 'credential of another account';
  end if;
  insert into public.vault_keys (credential_id, account_id, prf_salt, wrapped_key, iv, label)
    values (vault_key_add.credential_id, acc, vault_key_add.prf_salt, vault_key_add.wrapped_key, vault_key_add.iv, vault_key_add.label)
    on conflict on constraint vault_keys_pkey do update set prf_salt = excluded.prf_salt, wrapped_key = excluded.wrapped_key,
      iv = excluded.iv, label = excluded.label;
end $$;

/** A passkey of the caller taken away: it no longer opens the Vault. */
create function public.vault_key_remove(credential_id text) returns void
  language sql security definer set search_path = public
as $$
  delete from public.vault_keys k where k.credential_id = vault_key_remove.credential_id and k.account_id = public.vault_account()
$$;

/** The caller's entries, by title. */
create function public.vault_entries_list() returns jsonb
  language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'value', e.value, 'iv', e.iv,
    'updatedAt', e.updated_at) order by lower(e.title)), '[]'::jsonb)
  from public.vault_entries e where e.account_id = public.vault_account()
$$;

/** An entry of the caller, new or changed; an id of someone else is refused. */
create function public.vault_entry_save(id uuid, title text, value text, iv text) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.vault_account();
begin
  if exists (select 1 from public.vault_entries e where e.id = vault_entry_save.id and e.account_id <> acc) then
    raise exception 'FORBIDDEN' using detail = 'entry of another account';
  end if;
  insert into public.vault_entries (id, account_id, title, value, iv)
    values (vault_entry_save.id, acc, vault_entry_save.title, vault_entry_save.value, vault_entry_save.iv)
    on conflict on constraint vault_entries_pkey do update set title = excluded.title, value = excluded.value,
      iv = excluded.iv, updated_at = now();
end $$;

create function public.vault_entry_remove(id uuid) returns void
  language sql security definer set search_path = public
as $$
  delete from public.vault_entries e where e.id = vault_entry_remove.id and e.account_id = public.vault_account()
$$;

revoke all on function public.vault_account() from public, anon, authenticated;
revoke all on function public.vault_keys_list() from public, anon;
revoke all on function public.vault_key_add(text, text, text, text, text) from public, anon;
revoke all on function public.vault_key_remove(text) from public, anon;
revoke all on function public.vault_entries_list() from public, anon;
revoke all on function public.vault_entry_save(uuid, text, text, text) from public, anon;
revoke all on function public.vault_entry_remove(uuid) from public, anon;
grant execute on function public.vault_keys_list() to authenticated;
grant execute on function public.vault_key_add(text, text, text, text, text) to authenticated;
grant execute on function public.vault_key_remove(text) to authenticated;
grant execute on function public.vault_entries_list() to authenticated;
grant execute on function public.vault_entry_save(uuid, text, text, text) to authenticated;
grant execute on function public.vault_entry_remove(uuid) to authenticated;
