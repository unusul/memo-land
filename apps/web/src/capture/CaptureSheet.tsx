import { useRef, useState } from 'react';
import { newActivity } from '@attivita/core';
import type { EngineLimits } from '@attivita/core';
import { instantNow, newId } from '../dates.js';
import { enqueueDraft, flushOutbox } from '../offline/outbox.js';
import type { QueuedFile } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { shrinkImage } from './images.js';

type Shrink = (file: File, limits: EngineLimits) => Promise<File>;

export function readBytes(f: Blob): Promise<Uint8Array> {
  if (typeof f.arrayBuffer === 'function') return f.arrayBuffer().then(b => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(f);
  });
}

/** Quick capture: text plus pasted, dropped or picked files; saved to the outbox first, so it works offline. */
export function CaptureSheet({ onSaved, onClose, shrink = shrinkImage }: { onSaved(): void; onClose(): void; shrink?: Shrink }) {
  const { account, primary: engine, outbox } = useSession();
  const ws = useWs();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(engine.limits.maxAttachmentBytes / 1_000_000);

  async function add(incoming: File[]) {
    for (const f of incoming) {
      const small = await shrink(f, engine.limits);
      if (small.size > engine.limits.maxAttachmentBytes) {
        setNotice(`L'allegato ${f.name} supera i ${maxMb} MB anche dopo la riduzione: non l'ho aggiunto.`);
      } else {
        setFiles(list => [...list, small]);
      }
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    if (pasted.length) { e.preventDefault(); void add(pasted); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    setSaving(true);
    const [first = '', ...rest] = text.trim().split('\n');
    const title = first.trim() || files[0]?.name || 'Bozza';
    const draft = newActivity({ id: newId(), accountId: account, title, body: rest.join('\n').trim() }, instantNow());
    try {
      const queued: QueuedFile[] = await Promise.all(files.map(async f => ({ name: f.name, mimeType: f.type || 'application/octet-stream', bytes: await readBytes(f) })));
      await enqueueDraft(outbox, account, draft, queued, instantNow());
    } catch {
      setNotice('Non sono riuscito a salvare la bozza su questo dispositivo: riprova.');
      setSaving(false);
      return;
    }
    onSaved();
    if (navigator.onLine) await flushOutbox(outbox, engine).then(() => ws.reload()).catch(() => undefined);
    setSaving(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Nuova bozza" className="sheet" onPaste={onPaste}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void add(Array.from(e.dataTransfer.files)); }}>
      <form className="stack" onSubmit={save}>
        <label htmlFor="capture-text" className="label">Idea</label>
        <textarea id="capture-text" autoFocus rows={3} placeholder="Scrivi, incolla uno screenshot o trascina un file" value={text} onChange={e => setText(e.target.value)} />
        {files.length > 0 && <ul className="attachments">{files.map((f, i) => <li key={i}>{f.name} <button type="button" className="link" aria-label={`Togli ${f.name}`} onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>togli</button></li>)}</ul>}
        {notice && <p className="error" role="alert">{notice}</p>}
        <input ref={picker} type="file" multiple accept="image/*,*/*" hidden onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <div className="btns">
          <button type="button" className="btn" onClick={() => picker.current?.click()}>Foto o file</button>
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn primary" disabled={saving || (!text.trim() && files.length === 0)}>Salva</button>
        </div>
        <p className="muted small">Le bozze le vedi solo tu. Senza rete restano sul dispositivo e partono appena torna la connessione.</p>
      </form>
    </div>
  );
}
