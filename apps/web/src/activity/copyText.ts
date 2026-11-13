import type { Activity } from '@attivita/core';

/**
 * What Copia puts on the clipboard: the title, the text, the items still to do as `- item`; empty parts leave no line.
 * Only the content: the properties (dates, who, repeat) mean something inside the app, not to whoever gets the text.
 */
export function activityText(a: Activity): string {
  const toDo = (a.checklist?.items ?? []).filter(i => !i.done).map(i => `- ${i.text}`);
  return [a.title.trim(), a.body.trim(), ...toDo].filter(Boolean).join('\n');
}
