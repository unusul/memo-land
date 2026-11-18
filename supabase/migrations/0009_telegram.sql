-- Telegram alerts, lite (user's choice, 2026-11-18): the start and the end of events reach the person on Telegram,
-- with the app closed. No Edge Functions: the database itself runs a job every minute (pg_cron) and calls the
-- Telegram Bot API (pg_net).
--
-- * The app computes the alerts (it has the occurrences, moves, covers and skips) for the next days and hands them
--   here, replacing those not yet sent; the job sends the ones due. A change made by someone else while the person's
--   app stays closed reaches the queue only when that app opens again: a limit of the lite version.
-- * Linking: the app asks for a code and opens t.me/<bot>?start=<code>; the job reads the bot's updates
--   (getUpdates, one call a minute, its answer read on the next run) and ties that chat to the account.
-- * The bot's token and username live in the Vault, as telegram_bot_token and telegram_bot_username. Without the
--   token nothing is called and the app says the bot is not set up.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table public.telegram_links (
  account_id text primary key,
  chat_id bigint,
  link_code text unique,
  code_expires timestamptz,
  on_start boolean not null default true,
  on_end boolean not null default false,
  linked_at timestamptz
);
alter table public.telegram_links enable row level security;

create table public.telegram_queue (
  id bigint generated always as identity primary key,
  account_id text not null,
  send_at timestamptz not null,
  body text not null,
  sent_at timestamptz
);
create index telegram_queue_due on public.telegram_queue (send_at) where sent_at is null;
alter table public.telegram_queue enable row level security;

-- One row: where the reading of the bot's updates stands.
create table public.telegram_state (
  id int primary key default 1 check (id = 1),
  update_offset bigint not null default 0,
  poll_request bigint
);
insert into public.telegram_state default values;
alter table public.telegram_state enable row level security;
-- No policies on the three tables: they are reached only through the functions below.

create function public.telegram_secret(secret_name text) returns text
  language sql stable security definer set search_path = public
as $$ select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1 $$;

/** Where the caller stands: is the bot set up, its name, is a chat tied, which alerts. */
create function public.telegram_status() returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  acc text := public.current_account();
  l public.telegram_links;
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  select * into l from public.telegram_links where account_id = acc;
  return jsonb_build_object(
    'configured', public.telegram_secret('telegram_bot_token') is not null,
    'bot', public.telegram_secret('telegram_bot_username'),
    'linked', l.chat_id is not null,
    'start', coalesce(l.on_start, true),
    'end', coalesce(l.on_end, false));
end $$;

/** A code valid 15 minutes for t.me/<bot>?start=<code>; null when the bot is not set up. */
create function public.telegram_link_code() returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  acc text := public.current_account();
  bot text := public.telegram_secret('telegram_bot_username');
  code text := substr(md5(random()::text || clock_timestamp()::text || coalesce(acc, '')), 1, 16);
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  if bot is null or public.telegram_secret('telegram_bot_token') is null then return null; end if;
  insert into public.telegram_links (account_id, link_code, code_expires) values (acc, code, now() + interval '15 minutes')
    on conflict (account_id) do update set link_code = excluded.link_code, code_expires = excluded.code_expires;
  return jsonb_build_object('code', code, 'bot', bot);
end $$;

create function public.telegram_set_alerts(on_start boolean, on_end boolean) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  insert into public.telegram_links (account_id, on_start, on_end) values (acc, telegram_set_alerts.on_start, telegram_set_alerts.on_end)
    on conflict (account_id) do update set on_start = excluded.on_start, on_end = excluded.on_end;
end $$;

/** Unties the chat and drops what was waiting to be sent. */
create function public.telegram_unlink() returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  delete from public.telegram_queue where account_id = acc;
  delete from public.telegram_links where account_id = acc;
end $$;

/**
 * The caller's alerts not sent yet are replaced by `items`, [{ "at": instant, "text": ... }]: only those still to
 * come, at most 300, each text at most 500 characters. Nothing is kept for an account without a chat.
 */
create function public.telegram_replace_queue(items jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  acc text := public.current_account();
  n int;
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  delete from public.telegram_queue where account_id = acc and sent_at is null;
  if not exists (select 1 from public.telegram_links where account_id = acc and chat_id is not null) then return 0; end if;
  insert into public.telegram_queue (account_id, send_at, body)
    select acc, (x ->> 'at')::timestamptz, left(x ->> 'text', 500)
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) x
    where (x ->> 'at')::timestamptz > now() and coalesce(x ->> 'text', '') <> ''
    order by (x ->> 'at')::timestamptz
    limit 300;
  get diagnostics n = row_count;
  return n;
end $$;

/** A message to a chat; the answer is not waited for. */
create function public.telegram_send(token text, chat bigint, body text) returns void
  language plpgsql security definer set search_path = public
as $$ begin
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', body));
end $$;

/**
 * The job of every minute: reads the answer of the last getUpdates and ties the chats that sent a valid code, asks for
 * the next updates, sends the alerts due (those more than 30 minutes late are dropped, not sent), and clears the old.
 */
create function public.telegram_tick() returns void
  language plpgsql security definer set search_path = public
as $$
declare
  token text := public.telegram_secret('telegram_bot_token');
  st public.telegram_state;
  answer record;
  u jsonb;
  said text;
  chat bigint;
  tied text;
  q record;
begin
  if token is null then return; end if;
  select * into st from public.telegram_state where id = 1 for update;

  if st.poll_request is not null then
    select status_code, content into answer from net._http_response where id = st.poll_request;
    if found then
      if answer.status_code = 200 then
        for u in select * from jsonb_array_elements(coalesce(answer.content::jsonb -> 'result', '[]'::jsonb)) loop
          st.update_offset := greatest(st.update_offset, (u ->> 'update_id')::bigint + 1);
          said := u -> 'message' ->> 'text';
          chat := (u -> 'message' -> 'chat' ->> 'id')::bigint;
          continue when said is null or chat is null or said not like '/start%';
          update public.telegram_links
            set chat_id = chat, linked_at = now(), link_code = null, code_expires = null
            where link_code = nullif(trim(substr(said, 7)), '') and code_expires > now()
            returning account_id into tied;
          perform public.telegram_send(token, chat, case when tied is not null
            then 'memo-land è collegato: qui arriveranno gli avvisi.'
            else 'Il codice è scaduto o non è giusto: ricomincia da memo-land, Impostazioni → Avvisi su Telegram.' end);
          tied := null;
        end loop;
      end if;
      st.poll_request := null;
    end if;
  end if;

  if st.poll_request is null then
    st.poll_request := net.http_get(url := 'https://api.telegram.org/bot' || token || '/getUpdates?timeout=0&offset=' || st.update_offset);
  end if;
  update public.telegram_state set update_offset = st.update_offset, poll_request = st.poll_request where id = 1;

  for q in
    select t.id, t.body, l.chat_id from public.telegram_queue t join public.telegram_links l using (account_id)
    where t.sent_at is null and t.send_at <= now() and t.send_at > now() - interval '30 minutes' and l.chat_id is not null
    order by t.send_at limit 50
  loop
    perform public.telegram_send(token, q.chat_id, q.body);
    update public.telegram_queue set sent_at = now() where id = q.id;
  end loop;

  delete from public.telegram_queue where (sent_at is null and send_at <= now() - interval '30 minutes')
    or sent_at < now() - interval '7 days';
end $$;

revoke all on function public.telegram_secret(text) from public, anon, authenticated;
revoke all on function public.telegram_send(text, bigint, text) from public, anon, authenticated;
revoke all on function public.telegram_tick() from public, anon, authenticated;
revoke all on function public.telegram_status() from public, anon;
revoke all on function public.telegram_link_code() from public, anon;
revoke all on function public.telegram_set_alerts(boolean, boolean) from public, anon;
revoke all on function public.telegram_unlink() from public, anon;
revoke all on function public.telegram_replace_queue(jsonb) from public, anon;
grant execute on function public.telegram_status() to authenticated;
grant execute on function public.telegram_link_code() to authenticated;
grant execute on function public.telegram_set_alerts(boolean, boolean) to authenticated;
grant execute on function public.telegram_unlink() to authenticated;
grant execute on function public.telegram_replace_queue(jsonb) to authenticated;

select cron.schedule('memo-land-telegram', '* * * * *', $$select public.telegram_tick()$$);
