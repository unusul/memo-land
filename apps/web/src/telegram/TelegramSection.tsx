import { useEffect, useState } from 'react';
import { useSession } from '../session/SessionContext.js';
import { refreshTelegram, useTelegramStatus } from './state.js';
import { telegramLink } from './store.js';
import type { TelegramStore } from './store.js';
import { useTelegramAlerts } from './useTelegramAlerts.js';
import { alertWords } from './alerts.js';
import type { Alert, AlertEntry } from './alerts.js';

/** How many of the next alerts Impostazioni lists. */
const UPCOMING = 10;
/** The test message goes a little ahead, as the server keeps only alerts still to come; it sends them every minute. */
const TEST_AHEAD_MS = 15_000;
const TEST_TEXT = 'Prova da memo-land: gli avvisi arrivano qui.';

/** While a link waits for the bot: the status is read again this often, for the code's 15 minutes. */
const LINK_CHECK_MS = 10_000;
const LINK_WAIT_MS = 15 * 60_000;

/**
 * Impostazioni → Avvisi su Telegram (user's choice, 2026-11-18, lite version): link the person's chat to the bot, choose
 * the alerts at the start and at the end of what has a time, unlink. Not shown where there is no server (the demo).
 */
export function TelegramSection() {
  const { telegram } = useSession();
  if (!telegram) return null;
  return (
    <div role="group" aria-label="Avvisi su Telegram" className="telegram stack">
      <p className="label">Avvisi su Telegram</p>
      <TelegramBody store={telegram} />
    </div>
  );
}

function TelegramBody({ store }: { store: TelegramStore }) {
  const status = useTelegramStatus();
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

  if (status === undefined) return <p className="muted small">Controllo…</p>;
  if (status === null) {
    return <p className="small">Non raggiungibili ora. <button type="button" className="link" onClick={() => void refreshTelegram(store)}>Riprova</button></p>;
  }
  if (!status.configured) return <p className="muted small">Il bot di memo-land non è ancora configurato su questo server.</p>;
  if (!status.linked) {
    return (
      <>
        <p className="muted small">Un messaggio per quello che ha un'ora, quando lo scegli con la campanella dell'attività.</p>
        {link ? <>
          <a className="btn primary" href={link} target="_blank" rel="noreferrer">Apri Telegram</a>
          <p className="muted small">Premi Avvia nella chat del bot e torna qui: si collega entro un minuto.</p>
          <button type="button" className="link" onClick={() => setLink(null)}>Annulla</button>
        </> : (
          <button type="button" className="btn" disabled={busy} onClick={() => void act(async () => {
            const got = await store.linkCode();
            setLink(got ? telegramLink(got.bot, got.code) : null);
          })}>Collega Telegram</button>
        )}
        {problem && <p className="error small" role="alert">{problem}</p>}
      </>
    );
  }
  return (
    <>
      <p className="small">Collegato{status.bot ? <> a <b>@{status.bot}</b></> : ''}.</p>
      <TestMessage store={store} />
      <Upcoming />
      <button type="button" className="btn" disabled={busy} onClick={() => void act(() => store.unlink())}>Scollega Telegram</button>
      {problem && <p className="error small" role="alert">{problem}</p>}
    </>
  );
}

/**
 * Manda una prova (user's request, 2026-11-19): a message a few seconds ahead, with the alerts already waiting, so the
 * person sees that Telegram answers without waiting for an event.
 */
function TestMessage({ store }: { store: TelegramStore }) {
  const alerts = useTelegramAlerts();
  const { demo } = useSession();
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setSaid(null);
    const test: Alert = { at: new Date(Date.now() + TEST_AHEAD_MS).toISOString(), text: TEST_TEXT };
    try {
      await store.replaceQueue([test, ...alerts.map(({ at, text }) => ({ at, text }))].sort((x, y) => x.at.localeCompare(y.at)));
      setSaid(demo ? 'Inviata: nella demo non parte niente' : 'Inviata: arriva entro un minuto');
    } catch {
      setSaid('Non riesco a raggiungere il server: riprova tra poco.');
    }
    setBusy(false);
  }
  return (
    <p className="test-row">
      <button type="button" className="btn" disabled={busy} onClick={() => void send()}>Manda una prova</button>
      {said && <span role="status" className="small muted">{said}</span>}
    </p>
  );
}

/**
 * Prossime notifiche (user's request, 2026-11-19): the first ten alerts of the next seven days, from the same list the
 * server is handed; it changes as soon as a bell does. Each says the event, «gio 26, 10:00 · Riunione · esempio.it»,
 * and under it which alert, «avviso 15 minuti prima» (user's choice: first the message itself was shown, with the time
 * it leaves, «gio 26, 09:45 Tra 15 minuti, 10:00: …», and two times side by side did not say which was which).
 */
function Upcoming() {
  const alerts = useTelegramAlerts().slice(0, UPCOMING);
  const now = new Date();
  return (
    <div className="upcoming" role="group" aria-label="Prossime notifiche">
      <p className="label">Prossime notifiche</p>
      {alerts.length === 0
        ? <p className="muted small">Nessuna nei prossimi 7 giorni. Si mettono con la campanella di un'attività con un'ora.</p>
        : <ul>{alerts.map(a => (
          <li key={`${a.at}|${a.text}`}>
            <span>{whenLabel(a.time, now)} · {a.what}</span>
            <span className="small muted">{whichAlert(a)}</span>
          </li>
        ))}</ul>}
      <p className="muted small">I prossimi 7 giorni, i primi {UPCOMING}. Un cambio fatto da altri arriva quando riapri l'app.</p>
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
