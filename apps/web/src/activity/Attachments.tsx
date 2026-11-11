import { useEffect, useState } from 'react';
import type { Activity, AttachmentRef, Engine } from '@attivita/core';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

const isImage = (f: AttachmentRef) => f.mimeType.startsWith('image/');

/** Images are shown inline, other files download on request; both are read from the engine holding the activity. */
export function Attachments({ activity }: { activity: Activity }) {
  const { primary } = useSession();
  const ws = useWs();
  const engine = activity.groupId === null ? primary : ws.engineOf(activity.groupId);
  if (activity.attachments.length === 0 || !engine) return null;
  return (
    <ul className="attachments">
      {activity.attachments.map(f => <li key={f.id}>{isImage(f) ? <ImagePreview file={f} engine={engine} /> : <Download file={f} engine={engine} />}</li>)}
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
  return <a href={url} target="_blank" rel="noreferrer"><img className="thumb" src={url} alt={file.name} /></a>;
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
