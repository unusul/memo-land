-- Alerts computed on the server (user's choices, 2026-11-19): the Edge Function alerts-tick computes them with the
-- app's own code and sends them on every channel the person has on, Telegram and the browser's push; a change made by
-- someone else alerts too, with every app closed. Before (0009) the app computed them and handed them here.
--
-- * pg_cron calls the function every minute through pg_net, with a secret header. Its address and the secret live in
--   the Vault as alerts_tick_url and alerts_tick_secret: without them nothing is called.
-- * Telegram stays in the database, which keeps the bot's token: the function asks alerts_send_telegram.
-- * telegram_tick (0009) goes on reading the bot's updates for «Collega Telegram» and sending the old queue, which
--   telegram_replace_queue no longer fills: the app, the function and this migration go online together.

-- «Telegram» in Impostazioni → Avvisi: the channel's switch, on for a chat already tied.
alter table public.telegram_links add column alerts_on boolean not null default true;

-- «Notifiche su questo dispositivo»: one row per device that asked for the push, as the browser gave it.
create table public.push_subscriptions (
  endpoint text primary key,
  account_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- «Manda una prova» asked for a test push: alerts-tick sends it on its next run and clears this.
  test_at timestamptz
);
create index push_subscriptions_account on public.push_subscriptions (account_id);
alter table public.push_subscriptions enable row level security;

-- What the function sent, by account and alert (core's alertKey), so an alert never goes twice; kept 8 days.
create table public.alerts_sent (
  account_id text not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (account_id, key)
);
alter table public.alerts_sent enable row level security;
-- No policies on the two tables: the app reaches them only through the functions below, the Edge Function with the
-- service key.

/** Where the caller stands on Telegram, as 0009, with the channel's switch. */
create or replace function public.telegram_status() returns jsonb
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
    'on', coalesce(l.alerts_on, true),
    'start', coalesce(l.on_start, true),
    'end', coalesce(l.on_end, false));
end $$;

/** The «Telegram» switch of Impostazioni → Avvisi. */
create function public.telegram_set_on(turned_on boolean) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  insert into public.telegram_links (account_id, alerts_on) values (acc, turned_on)
    on conflict (account_id) do update set alerts_on = excluded.alerts_on;
end $$;

/** The app hands alerts to the server no more (0009): what was waiting goes, nothing is kept. */
create or replace function public.telegram_replace_queue(items jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  delete from public.telegram_queue where account_id = acc and sent_at is null;
  return 0;
end $$;

/** This device asks for the push: its endpoint is the caller's, taken over if another account had it. */
create function public.push_subscribe(endpoint text, p256dh text, auth text) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  if coalesce(push_subscribe.endpoint, '') not like 'https://%' or length(push_subscribe.endpoint) > 1000
    or coalesce(push_subscribe.p256dh, '') = '' or coalesce(push_subscribe.auth, '') = '' then
    raise exception 'INVALID_INPUT' using detail = 'not a push subscription';
  end if;
  insert into public.push_subscriptions (endpoint, account_id, p256dh, auth)
    values (push_subscribe.endpoint, acc, push_subscribe.p256dh, push_subscribe.auth)
    on conflict on constraint push_subscriptions_pkey do update set account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

/** This device stops the push; only the caller's own. */
create function public.push_unsubscribe(endpoint text) returns void
  language plpgsql security definer set search_path = public
as $$
declare acc text := public.current_account();
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  delete from public.push_subscriptions where push_subscriptions.endpoint = push_unsubscribe.endpoint and account_id = acc;
end $$;

/**
 * «Manda una prova» (2026-11-19): a message now to the caller's chat, if Telegram is on, and a test push on each of the
 * caller's devices, which alerts-tick sends within a minute. Says what it did: { telegram, devices }.
 */
create function public.alerts_test() returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  acc text := public.current_account();
  token text := public.telegram_secret('telegram_bot_token');
  chat bigint;
  devices int;
begin
  if acc is null then raise exception 'FORBIDDEN' using detail = 'not signed in'; end if;
  select chat_id into chat from public.telegram_links where account_id = acc and alerts_on and chat_id is not null;
  if token is not null and chat is not null then
    perform public.telegram_send(token, chat, 'Prova da memo-land: gli avvisi arrivano qui.');
  end if;
  update public.push_subscriptions set test_at = now() where account_id = acc;
  get diagnostics devices = row_count;
  return jsonb_build_object('telegram', token is not null and chat is not null, 'devices', devices);
end $$;

/** For the Edge Function only: a message to the account's chat, if it has one with the switch on. */
create function public.alerts_send_telegram(account text, body text) returns boolean
  language plpgsql security definer set search_path = public
as $$
declare
  token text := public.telegram_secret('telegram_bot_token');
  chat bigint;
begin
  select chat_id into chat from public.telegram_links where account_id = account and alerts_on and chat_id is not null;
  if token is null or chat is null then return false; end if;
  perform public.telegram_send(token, chat, left(body, 500));
  return true;
end $$;

/** The job of every minute: calls alerts-tick, without waiting for its answer. */
create function public.alerts_tick_call() returns void
  language plpgsql security definer set search_path = public
as $$
declare
  url text := public.telegram_secret('alerts_tick_url');
  secret text := public.telegram_secret('alerts_tick_secret');
begin
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerts-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000);
end $$;

revoke all on function public.telegram_set_on(boolean) from public, anon;
revoke all on function public.push_subscribe(text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.alerts_test() from public, anon;
grant execute on function public.alerts_test() to authenticated;
revoke all on function public.alerts_send_telegram(text, text) from public, anon, authenticated;
revoke all on function public.alerts_tick_call() from public, anon, authenticated;
grant execute on function public.telegram_set_on(boolean) to authenticated;
grant execute on function public.push_subscribe(text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.alerts_send_telegram(text, text) to service_role;

select cron.schedule('memo-land-alerts', '* * * * *', $$select public.alerts_tick_call()$$);
