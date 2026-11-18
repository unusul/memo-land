import { useEffect, useState } from 'react';
import { useSession } from '../session/SessionContext.js';
import { refreshTelegram, useTelegramStatus } from './state.js';
import { telegramLink } from './store.js';
import type { TelegramStore } from './store.js';

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
        <p className="muted small">Un messaggio all'inizio e, se vuoi, alla fine di quello che ha un'ora: tuo o di nessuno.</p>
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
  const choose = (start: boolean, end: boolean) => void act(() => store.setAlerts({ start, end }));
  return (
    <>
      <p className="small">Collegato{status.bot ? <> a <b>@{status.bot}</b></> : ''}.</p>
      <label className="small fixed-switch">
        <input type="checkbox" aria-label="Avviso all'inizio" checked={status.start} disabled={busy} onChange={e => choose(e.target.checked, status.end)} />
        All'inizio (o alla scadenza, se ha un'ora)
      </label>
      <label className="small fixed-switch">
        <input type="checkbox" aria-label="Avviso alla fine" checked={status.end} disabled={busy} onChange={e => choose(status.start, e.target.checked)} />
        Alla fine, se ha una durata
      </label>
      <p className="muted small">Partono dagli orari della prossima settimana, aggiornati quando apri l'app: un cambio fatto da altri arriva quando la riapri.</p>
      <button type="button" className="btn" disabled={busy} onClick={() => void act(() => store.unlink())}>Scollega Telegram</button>
      {problem && <p className="error small" role="alert">{problem}</p>}
    </>
  );
}
