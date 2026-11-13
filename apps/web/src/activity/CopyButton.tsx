import { useEffect, useState } from 'react';
import type { Activity } from '@attivita/core';
import { Icon } from '../shell/icons.js';
import { activityText } from './copyText.js';

const SHOWN_MS = 2000;

/**
 * The old copy command, for browsers that deny the clipboard permission (embedded views, the app's preview pane): it
 * copies the selection of a hidden field, put there for the moment and taken away again.
 */
function copyFromField(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.className = 'sr-only';
  document.body.append(field);
  field.focus();
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Copia, and Condividi where the system has a share menu (phones): both send the activity's content, and say for a
 * couple of seconds when something did not work. Closing the share menu without choosing is not a failure.
 */
export function CopyButton({ activity }: { activity: Activity }) {
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), SHOWN_MS);
    return () => clearTimeout(t);
  }, [said]);
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    const text = activityText(activity);
    const done = await navigator.clipboard.writeText(text).then(() => true, () => copyFromField(text));
    setSaid(done ? 'Copiata' : 'Non sono riuscito a copiare');
  }

  async function share() {
    try {
      await navigator.share({ title: activity.title.trim(), text: activityText(activity) });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setSaid('Non sono riuscito a condividere');
    }
  }

  return (
    <span className="copy">
      <span role="status" className="small muted">{said}</span>
      {canShare && (
        <button type="button" className="icon-choice small" aria-label="Condividi" title="Condividi" onClick={() => void share()}>
          <Icon name="share" size={18} />
        </button>
      )}
      <button type="button" className="icon-choice small" aria-label="Copia il testo" title="Copia il testo" onClick={() => void copy()}>
        <Icon name="copy" size={18} />
      </button>
    </span>
  );
}
