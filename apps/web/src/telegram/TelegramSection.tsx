import { useEffect, useState } from 'react';
import { useSession } from '../session/SessionContext.js';
import { refreshTelegram, telegramOn, useTelegramStatus } from './state.js';
import { telegramLink } from './store.js';
import type { TelegramStatus, TelegramStore } from './store.js';
import { disablePush, enablePush, pushSupport, usePushOn } from './push.js';
import { useTelegramAlerts } from './useTelegramAlerts.js';
import { SettingRow, SettingsCard, Switch } from '../settings/Card.js';
import { Icon } from '../shell/icons.js';
import { PopMenu } from '../shell/PopMenu.js';
import { alertWords } from './alerts.js';
import type { AlertEntry } from './alerts.js';

/** How many of the next alerts Impostazioni lists. */
const UPCOMING = 10;

/** While a link waits for the bot: the status is read again this often, for the code's 15 minutes. */
const LINK_CHECK_MS = 10_000;
const LINK_WAIT_MS = 15 * 60_000;

/**
 * Impostazioni → Avvisi (user's choices, 2026-11-19): one switch per channel, «Telegram» and «Notifiche su questo
 * dispositivo»; every alert goes on all those on. The server computes and sends the alerts (alerts-tick), with the
 * app closed too. A card of rows, as the rest of Impostazioni; Scollega Telegram under its ⋯. Before (2026-11-18) only
 * «Avvisi su Telegram», with alerts the app handed to the server. Not shown where there is no server.
 */
export function TelegramSection() {
  const { telegram } = useSession();
  if (!telegram) return null;
  return (
    <SettingsCard title="Avvisi" className="telegram">
      <AlertsBody store={telegram} />
    </SettingsCard>
  );
}

function AlertsBody({ store }: { store: TelegramStore }) {
  const status = useTelegramStatus();
  const device = usePushOn();
  const channels = [telegramOn(status) && 'su Telegram', device === true && 'su questo dispositivo'].filter(Boolean) as string[];
  return (
    <>
      <TelegramChannel store={store} status={status} />
      <DeviceChannel store={store} on={device} />
      {channels.length > 0 && <>
        <TestMessage store={store} />
        <Upcoming channels={channels} />
      </>}
    </>
  );
}

/** «Collega Telegram», then the channel's switch, with Scollega under ⋯. */
function TelegramChannel({ store, status }: { store: TelegramStore; status: TelegramStatus | null | undefined }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // While the person goes to Telegram and back, the status is read again until the chat is tied.
  useEffect(() => {
    if (!link || status?.linked) return;
    const every = setInterval(() => void refreshTelegram(store), LINK_CHECK_MS);
    const stop = setTimeout(() => setLink(null), LINK_WAIT_MS);
    return () => { clearInterval(every); clearTimeout(stop); };
  }, [link, status?.linked, store]);
  useEffect(() => { if (status?.linked) setLink(null); }, [status?.linked]);

  const act = async (what: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await what(); await refreshTelegram(store); } catch { setProblem('Non riesco a raggiungere il server: riprova tra poco.'); }
    setBusy(false);
  };
  const error = problem && <p className="error small" role="alert">{problem}</p>;

  if (status === undefined) return <SettingRow label="Telegram"><span className="muted small">controllo…</span></SettingRow>;
  if (status === null) {
    return <SettingRow label="Telegram" hint="Non raggiungibile ora"><button type="button" className="link" onClick={() => void refreshTelegram(store)}>Riprova</button></SettingRow>;
  }
  if (!status.configured) return <SettingRow label="Telegram" hint="Il bot di memo-land non è ancora configurato su questo server" />;
  if (!status.linked) {
    return (
      <>
        <SettingRow label="Telegram" hint={link ? 'Premi Avvia nella chat del bot e torna qui: si collega entro un minuto' : 'Un messaggio per quello che scegli con la campanella'}>
          {link ? <>
            <a className="btn primary" href={link} target="_blank" rel="noreferrer">Apri Telegram</a>
            <button type="button" className="link" onClick={() => setLink(null)}>Annulla</button>
          </> : (
            <button type="button" className="btn" disabled={busy} onClick={() => void act(async () => {
              const got = await store.linkCode();
              setLink(got ? telegramLink(got.bot, got.code) : null);
            })}>Collega Telegram</button>
          )}
        </SettingRow>
        {error}
      </>
    );
  }
  return (
    <>
      <SettingRow label="Telegram" hint={status.bot ? `@${status.bot}` : undefined}>
        <Switch label="Telegram" on={status.on !== false} disabled={busy} onChange={on => void act(() => store.setOn(on))} />
        <PopMenu className="icon-choice small" buttonLabel="Altro su Telegram" title="Altro" label={<Icon name="more" size={18} />} menuLabel="Altro su Telegram" roomBelow={80}>
          {close => <button type="button" role="menuitem" disabled={busy} onClick={() => { close(); void act(() => store.unlink()); }}>Scollega Telegram</button>}
        </PopMenu>
      </SettingRow>
      {error}
    </>
  );
}

/**
 * «Notifiche su questo dispositivo» (2026-11-19): the browser's push, for this phone or computer only. The permission is
 * asked at the tap; on an iPhone only with the app on the Home screen.
 */
function DeviceChannel({ store, on }: { store: TelegramStore; on: boolean | undefined }) {
  const support = pushSupport();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = 'Notifiche su questo dispositivo';
  if (support === 'no-key') return <SettingRow label={label} hint="Non ancora configurate su questo server" />;
  if (support === 'install') return <SettingRow label={label} hint="Su iPhone solo con memo-land nella schermata Home: Condividi → Aggiungi alla schermata Home, poi aprila da lì" />;
  if (support === 'unsupported') return <SettingRow label={label} hint="Questo browser non riceve notifiche" />;
  async function toggle(next: boolean) {
    setBusy(true); setProblem(null);
    try {
      await (next ? enablePush(store) : disablePush(store));
    } catch (e) {
      setProblem((e as Error).message === 'denied'
        ? 'Permesso negato: riattiva le notifiche per memo-land nelle impostazioni del browser.'
        : 'Non riesco ad attivarle ora: riprova tra poco.');
    }
    setBusy(false);
  }
  return (
    <>
      <SettingRow label={label}>
        <Switch label={label} on={on === true} disabled={busy || on === undefined} onChange={next => void toggle(next)} />
      </SettingRow>
      {problem && <p className="error small" role="alert">{problem}</p>}
    </>
  );
}

/**
 * Manda una prova (user's request, 2026-11-19): a message now on Telegram, a test push on each device within a minute,
 * so the person sees the channels answer without waiting for an event. Sent by the server since 2026-11-19.
 */
function TestMessage({ store }: { store: TelegramStore }) {
  const { demo } = useSession();
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setSaid(null);
    try {
      const done = await store.test();
      setSaid(demo ? 'Inviata: nella demo non parte niente'
        : done.devices > 0 ? 'Inviata: su Telegram subito, sui dispositivi entro un minuto'
        : done.telegram ? 'Inviata su Telegram' : 'Nessun canale acceso sul server');
    } catch {
      setSaid('Non riesco a raggiungere il server: riprova tra poco.');
    }
    setBusy(false);
  }
  return (
    <SettingRow label="Prova" hint={said ? <span role="status">{said}</span> : 'Un messaggio su ogni canale acceso'}>
      <button type="button" className="btn" disabled={busy} onClick={() => void send()}>Manda una prova</button>
    </SettingRow>
  );
}

/**
 * Prossime notifiche (user's request, 2026-11-19): the first ten alerts of the next seven days, computed with the same
 * code (packages/core) and the same prefs as the server, so the list is what will go; it changes as soon as a bell does.
 * Each says the event, «gio 26, 10:00 · Riunione · esempio.it», and under it which alert, «avviso 15 minuti prima».
 */
function Upcoming({ channels }: { channels: string[] }) {
  const alerts = useTelegramAlerts().slice(0, UPCOMING);
  const now = new Date();
  return (
    <div className="upcoming" role="group" aria-label="Prossime notifiche">
      <p className="label">Prossime notifiche</p>
      {alerts.length === 0
        ? <p className="muted small">Nessuna nei prossimi 7 giorni. Si mettono con la campanella di un'attività.</p>
        : <ul>{alerts.map(a => (
          <li key={`${a.at}|${a.text}`}>
            <span>{whenLabel(a.time, now)} · {a.what}</span>
            <span className="small muted">{whichAlert(a)}</span>
          </li>
        ))}</ul>}
      <p className="muted small">I prossimi 7 giorni, i primi {UPCOMING}. Partono dal server anche ad app chiusa, {channels.join(' e ')}; anche un cambio fatto da altri.</p>
    </div>
  );
}

/** «avviso all'inizio», «avviso 15 minuti prima dell'inizio», «avviso 1 ora prima della fine». */
export function whichAlert({ of, before }: Pick<AlertEntry, 'of' | 'before'>): string {
  return `avviso ${alertWords({ of, before })}`;
}

const WEEKDAY = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * «oggi 16:15», «domani 17:15», «sab 21, 15:00»: a moment, as an instant or as a local date-time of this device; a
 * date alone, «oggi», «sab 21».
 */
export function whenLabel(iso: string, now = new Date()): string {
  const dateOnly = iso.length <= 10;
  const at = new Date(dateOnly ? `${iso}T00:00` : iso);
  const time = dateOnly ? '' : ` ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(at) - day(now)) / 86_400_000);
  if (diff === 0) return `oggi${time}`;
  if (diff === 1) return `domani${time}`;
  return `${WEEKDAY.format(at).replace('.', '')} ${at.getDate()}${time ? `,${time}` : ''}`;
}
