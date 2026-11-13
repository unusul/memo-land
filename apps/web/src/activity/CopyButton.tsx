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

/** Copies the activity's content to the clipboard and says, for a couple of seconds, whether it worked. */
export function CopyButton({ activity }: { activity: Activity }) {
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), SHOWN_MS);
    return () => clearTimeout(t);
  }, [said]);

  async function copy() {
    const text = activityText(activity);
    const done = await navigator.clipboard.writeText(text).then(() => true, () => copyFromField(text));
    setSaid(done ? 'Copiata' : 'Non sono riuscito a copiare');
  }

  return (
    <span className="copy">
      <span role="status" className="small muted">{said}</span>
      <button type="button" className="icon-choice small" aria-label="Copia il testo" title="Copia il testo" onClick={() => void copy()}>
        <Icon name="copy" size={18} />
      </button>
    </span>
  );
}
