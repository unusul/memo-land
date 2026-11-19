import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '../shell/back.js';
import { Icon } from '../shell/icons.js';
import { PanelBackdrop, useEscape } from '../shell/PanelActions.js';
import type { Activity, AttachmentRef, Engine } from '@attivita/core';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

const isImage = (f: AttachmentRef) => f.mimeType.startsWith('image/');

/**
 * Images are shown inline, other files download on request; both are read from the engine holding the activity.
 * `onRemove`, for who edits it: a small x beside each takes it away (user's choice, 2026-11-18).
 */
export function Attachments({ activity, onRemove }: { activity: Activity; onRemove?: ((id: string) => void) | undefined }) {
  const { primary } = useSession();
  const ws = useWs();
  const engine = activity.groupId === null ? primary : ws.engineOf(activity.groupId);
  if (activity.attachments.length === 0 || !engine) return null;
  return (
    <ul className="attachments">
      {activity.attachments.map(f => (
        <li key={f.id} className="attachment">
          {isImage(f) ? <ImagePreview file={f} engine={engine} /> : <Download file={f} engine={engine} />}
          {onRemove && <button type="button" className="icon-choice small attachment-remove" aria-label={`Togli ${f.name}`} title="Togli l'allegato" onClick={() => onRemove(f.id)}><Icon name="close" size={16} /></button>}
        </li>
      ))}
    </ul>
  );
}

async function objectUrl(engine: Engine, f: AttachmentRef): Promise<string> {
  const bytes = await engine.getAttachment(f);
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.mimeType }));
}

const unavailable = (f: AttachmentRef) => `${f.name}: non si può aprire adesso, riprova quando c'è rete.`;

function ImagePreview({ file, engine }: { file: AttachmentRef; engine: Engine }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    objectUrl(engine, file).then(u => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
    // By id: every reload brings new ref objects for the same file.
  }, [engine, file.id]);
  if (failed) return <span className="muted">{unavailable(file)}</span>;
  if (!url) return <span className="muted">{file.name}…</span>;
  return <ImageButton url={url} name={file.name} />;
}

/**
 * The thumbnail opens the image large over the page, inside the app (user's bug, 2026-11-18: it was a link to a new
 * window, and the app installed on a computer sent it to the browser). x, Esc or the phone's back close it.
 */
function ImageButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useBackLayer(open, close);
  useEscape(open, close);
  return (
    <>
      <button type="button" className="thumb-open" aria-label={`Apri ${name}`} onClick={() => setOpen(true)}><img className="thumb" src={url} alt={name} /></button>
      {open && createPortal(<>
        <PanelBackdrop />
        <div className="viewer" role="dialog" aria-modal="true" aria-label={name}>
          <button type="button" className="icon-choice viewer-close" aria-label="Chiudi" title="Chiudi (Esc)" onClick={close}><Icon name="close" size={22} /></button>
          <img src={url} alt={name} />
        </div>
      </>, document.body)}
    </>
  );
}

function Download({ file, engine }: { file: AttachmentRef; engine: Engine }) {
  const [failed, setFailed] = useState(false);
  async function save() {
    try {
      setFailed(false);
      const url = await objectUrl(engine, file);
      const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <>
      <button className="link" aria-label={`Scarica ${file.name}`} onClick={() => void save()}>{file.name}</button>
      {failed && <span className="muted"> {unavailable(file)}</span>}
    </>
  );
}
